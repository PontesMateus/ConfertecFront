<script setup>
import { PickingService } from '@/service/PickingService';
import { session } from '@/service/session';
import { formatDateTime } from '@/utils/date';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const shipments = ref([]);
const loading = ref(true);
const loadError = ref('');
const search = ref('');
const startingUuid = ref(null);

const myUuid = computed(() => session.state.user?.uuid);

const filteredShipments = computed(() => {
    const term = normalize(search.value.trim());
    if (!term) return shipments.value;
    return shipments.value.filter((shipment) => [label(shipment), shipment.customer, shipment.venture, shipment.vehicle].some((value) => value && normalize(value).includes(term)));
});

/** Case- and accent-insensitive comparison, so "construcao" finds "Construção". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function label(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

function isMine(shipment) {
    return shipment.picking?.userUuid === myUuid.value;
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        shipments.value = await PickingService.listQueue();
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

/** Opens the picking's batch, with every shipment picked together with it */
function openPicking(batchUuid) {
    router.push({ name: 'picking', params: { batchUuid } });
}

/** How many other shipments of the list are picked on the same screen */
const batchSizes = computed(() => {
    const sizes = new Map();
    for (const shipment of shipments.value) {
        if (shipment.picking) sizes.set(shipment.picking.batchUuid, (sizes.get(shipment.picking.batchUuid) ?? 0) + 1);
    }
    return sizes;
});

function otherInBatch(shipment) {
    return (batchSizes.value.get(shipment.picking.batchUuid) ?? 1) - 1;
}

function confirmStart(shipment) {
    confirm.require({
        header: 'Iniciar separação',
        message: `Você será o responsável pela separação da remessa ${label(shipment)} (${shipment.itemCount} ${shipment.itemCount === 1 ? 'item' : 'itens'}). Deseja iniciar?`,
        icon: 'pi pi-box',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Iniciar separação' },
        accept: () => start(shipment)
    });
}

async function start(shipment) {
    startingUuid.value = shipment.uuid;
    try {
        const picking = await PickingService.start(shipment.uuid);
        openPicking(picking.batchUuid);
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
                <h1 class="text-2xl font-semibold m-0">Remessas para separar</h1>
                <p class="text-muted-color m-0 mt-1">Remessas ainda não separadas ou com separação em andamento, da saída mais próxima para a mais distante.</p>
            </div>
            <Button label="Atualizar" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
            </div>
        </Message>

        <DataTable :value="filteredShipments" :loading="loading" dataKey="uuid" sortField="shippingAt" :sortOrder="1" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
            <template #header>
                <div class="flex justify-end">
                    <IconField class="w-full sm:w-80">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por remessa, cliente, obra ou veículo" fluid />
                    </IconField>
                </div>
            </template>

            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhuma remessa aguardando separação.</div>
            </template>

            <Column field="record" header="Remessa" sortable class="whitespace-nowrap">
                <template #body="{ data }">
                    <span class="font-medium">{{ data.record }}</span>
                    <span class="text-muted-color">-{{ data.recordReceipt }}</span>
                </template>
            </Column>
            <Column field="shippingAt" header="Saída" sortable class="whitespace-nowrap">
                <template #body="{ data }">{{ formatDateTime(data.shippingAt) }}</template>
            </Column>
            <Column field="customer" header="Cliente" sortable>
                <template #body="{ data }">{{ data.customer ?? '—' }}</template>
            </Column>
            <Column field="venture" header="Obra" sortable>
                <template #body="{ data }">{{ data.venture ?? '—' }}</template>
            </Column>
            <Column field="vehicle" header="Veículo" sortable class="whitespace-nowrap">
                <template #body="{ data }">
                    <span v-if="data.vehicle">{{ data.vehicle }}</span>
                    <Tag v-else value="Não informado" icon="pi pi-exclamation-triangle" severity="warn" />
                </template>
            </Column>
            <Column header="Separação" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-if="data.picking" class="flex flex-col gap-1 min-w-36">
                        <span class="text-sm">
                            <Tag value="Em andamento" severity="info" class="mr-1" />
                            {{ isMine(data) ? 'por você' : `por ${data.picking.userName}` }}
                        </span>
                        <ProgressBar :value="data.itemCount ? Math.round((data.picking.doneItemCount / data.itemCount) * 100) : 0" :showValue="false" class="h-1.5" />
                        <span class="text-xs text-muted-color">{{ data.picking.doneItemCount }} de {{ data.itemCount }} itens completos</span>
                        <span v-if="otherInBatch(data)" class="text-xs text-muted-color"> <i class="pi pi-link text-xs mr-1"></i>Separada junto com {{ otherInBatch(data) === 1 ? 'outra remessa' : `outras ${otherInBatch(data)} remessas` }} </span>
                        <Tag
                            v-if="data.picking.openIssueCount"
                            :value="data.picking.openIssueCount === 1 ? '1 falta pendente' : `${data.picking.openIssueCount} faltas pendentes`"
                            icon="pi pi-exclamation-triangle"
                            severity="warn"
                            class="self-start"
                        />
                    </div>
                    <span v-else class="text-muted-color">Não iniciada · {{ data.itemCount }} {{ data.itemCount === 1 ? 'item' : 'itens' }}</span>
                </template>
            </Column>
            <Column header="" class="w-0 whitespace-nowrap">
                <template #body="{ data }">
                    <div class="flex justify-end">
                        <Button v-if="!data.picking" label="Iniciar" icon="pi pi-play" size="small" :loading="startingUuid === data.uuid" :disabled="!!startingUuid" @click="confirmStart(data)" />
                        <Button v-else-if="isMine(data)" label="Continuar" icon="pi pi-arrow-right" iconPos="right" size="small" severity="contrast" @click="openPicking(data.picking.batchUuid)" />
                        <Button v-else label="Ver" icon="pi pi-eye" size="small" severity="secondary" outlined v-tooltip.left="`Em separação por ${data.picking.userName}`" @click="openPicking(data.picking.batchUuid)" />
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>
</template>
