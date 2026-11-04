<script setup>
import { CheckService } from '@/service/CheckService';
import { session } from '@/service/session';
import { formatDateTime } from '@/utils/date';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const entries = ref([]);
const loading = ref(true);
const loadError = ref('');
const search = ref('');
const startingUuid = ref(null);

const myUuid = computed(() => session.state.user?.uuid);

const filteredEntries = computed(() => {
    const term = normalize(search.value.trim());
    if (!term) return entries.value;
    return entries.value.filter((entry) => [label(entry), entry.shipment.customer, entry.shipment.venture, entry.shipment.vehicle, entry.pickingUserName].some((value) => value && normalize(value).includes(term)));
});

/** Case- and accent-insensitive comparison, so "construcao" finds "Construção". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function label(entry) {
    return `${entry.shipment.record}-${entry.shipment.recordReceipt}`;
}

function isMine(entry) {
    return entry.check?.userUuid === myUuid.value;
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        entries.value = await CheckService.listQueue();
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

function openCheck(checkUuid) {
    router.push({ name: 'check', params: { checkUuid } });
}

function confirmStart(entry) {
    confirm.require({
        header: 'Iniciar conferência',
        message: `Você será o responsável pela conferência da remessa ${label(entry)} (${entry.itemCount} ${entry.itemCount === 1 ? 'item' : 'itens'}). Conte cada item sem consultar a remessa. Deseja iniciar?`,
        icon: 'pi pi-check-square',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Iniciar conferência' },
        accept: () => start(entry)
    });
}

async function start(entry) {
    startingUuid.value = entry.pickingUuid;
    try {
        const check = await CheckService.start(entry.pickingUuid);
        openCheck(check.uuid);
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível iniciar', detail: error.message, life: 5000 });
        // Someone else may have started it meanwhile
        load();
    } finally {
        startingUuid.value = null;
    }
}

onMounted(load);
</script>

<template>
    <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
                <h1 class="text-2xl font-semibold m-0">Remessas para conferir</h1>
                <p class="text-muted-color m-0 mt-1">Separações concluídas aguardando conferência, da saída mais próxima para a mais distante.</p>
            </div>
            <Button label="Atualizar" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
            </div>
        </Message>

        <DataTable :value="filteredEntries" :loading="loading" dataKey="pickingUuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
            <template #header>
                <div class="flex justify-end">
                    <IconField class="w-full sm:w-80">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por remessa, cliente, obra, veículo ou separador" fluid />
                    </IconField>
                </div>
            </template>

            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhuma separação aguardando conferência.</div>
            </template>

            <Column header="Remessa" class="whitespace-nowrap">
                <template #body="{ data }">
                    <span class="font-medium">{{ data.shipment.record }}</span>
                    <span class="text-muted-color">-{{ data.shipment.recordReceipt }}</span>
                    <Tag v-if="data.recount" value="Reconferência" icon="pi pi-replay" severity="warn" class="ml-2" v-tooltip.top="'A conferência anterior encontrou divergências'" />
                </template>
            </Column>
            <Column header="Saída" class="whitespace-nowrap">
                <template #body="{ data }">{{ formatDateTime(data.shipment.shippingAt) }}</template>
            </Column>
            <Column header="Cliente">
                <template #body="{ data }">{{ data.shipment.customer ?? '—' }}</template>
            </Column>
            <Column header="Obra">
                <template #body="{ data }">{{ data.shipment.venture ?? '—' }}</template>
            </Column>
            <Column header="Veículo" class="whitespace-nowrap">
                <template #body="{ data }">
                    <span v-if="data.shipment.vehicle">{{ data.shipment.vehicle }}</span>
                    <Tag v-else value="Não informado" icon="pi pi-exclamation-triangle" severity="warn" />
                </template>
            </Column>
            <Column header="Separação" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div>{{ data.pickingUserName }}</div>
                    <div class="text-xs text-muted-color">Concluída em {{ formatDateTime(data.pickingFinishedAt) }}</div>
                </template>
            </Column>
            <Column header="Conferência" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-if="data.check" class="flex flex-col gap-1 min-w-36">
                        <span class="text-sm">
                            <Tag value="Em andamento" severity="info" class="mr-1" />
                            {{ isMine(data) ? 'por você' : `por ${data.check.userName}` }}
                        </span>
                        <ProgressBar :value="data.itemCount ? Math.round((data.check.countedCount / data.itemCount) * 100) : 0" :showValue="false" class="h-1.5" />
                        <span class="text-xs text-muted-color">{{ data.check.countedCount }} de {{ data.itemCount }} itens contados</span>
                    </div>
                    <span v-else class="text-muted-color">Não iniciada · {{ data.itemCount }} {{ data.itemCount === 1 ? 'item' : 'itens' }}</span>
                </template>
            </Column>
            <Column header="" class="w-0 whitespace-nowrap">
                <template #body="{ data }">
                    <div class="flex justify-end">
                        <Button v-if="!data.check" label="Iniciar" icon="pi pi-play" size="small" :loading="startingUuid === data.pickingUuid" :disabled="!!startingUuid" @click="confirmStart(data)" />
                        <Button v-else-if="isMine(data)" label="Continuar" icon="pi pi-arrow-right" iconPos="right" size="small" severity="contrast" @click="openCheck(data.check.uuid)" />
                        <Tag v-else value="Em conferência" severity="secondary" v-tooltip.left="`Em conferência por ${data.check.userName}`" />
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>
</template>
