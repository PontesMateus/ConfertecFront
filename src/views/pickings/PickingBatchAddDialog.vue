<script setup>
import { PickingService } from '@/service/PickingService';
import { session } from '@/service/session';
import { formatDateTime } from '@/utils/date';
import { computed, ref, watch } from 'vue';

const props = defineProps({
    /** Batch the shipments go into */
    batch: { type: Object, default: null }
});
/** Emits the updated batch and how many shipments were added */
const emit = defineEmits(['added']);
const visible = defineModel('visible', { type: Boolean, default: false });

const shipments = ref([]);
const loading = ref(false);
const loadError = ref('');
const search = ref('');
const selected = ref([]);
const adding = ref(false);
const failures = ref([]);

const myUuid = computed(() => session.state.user?.uuid);

/** Not started yet, or the picker's own picking in progress in another batch */
const available = computed(() => shipments.value.filter((shipment) => !shipment.picking || (shipment.picking.userUuid === myUuid.value && shipment.picking.status === 'Em andamento' && shipment.picking.batchUuid !== props.batch?.uuid)));

const filtered = computed(() => {
    const term = normalize(search.value.trim());
    if (!term) return available.value;
    return available.value.filter((shipment) => [label(shipment), shipment.customer, shipment.venture, shipment.vehicle].some((value) => value && normalize(value).includes(term)));
});

/** Case- and accent-insensitive comparison, so "construcao" finds "Construção". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function label(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
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

watch(visible, (open) => {
    if (!open) return;
    selected.value = [];
    failures.value = [];
    search.value = '';
    load();
});

/** One request per shipment, so one that fails (started by someone meanwhile) does not stop the others */
async function add() {
    adding.value = true;
    failures.value = [];
    let latest = null;
    const failed = [];
    for (const shipment of selected.value) {
        try {
            latest = await PickingService.addShipmentToBatch(props.batch.uuid, shipment.uuid);
        } catch (error) {
            failed.push({ shipment, message: error.message });
        }
    }
    if (latest) emit('added', latest, selected.value.length - failed.length);
    adding.value = false;
    if (!failed.length) {
        visible.value = false;
        return;
    }
    failures.value = failed.map(({ shipment, message }) => `${label(shipment)}: ${message}`);
    selected.value = [];
    load();
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Adicionar remessas à separação" modal :closable="!adding" :style="{ width: '60rem' }" :breakpoints="{ '960px': '95vw' }">
        <div class="flex flex-col gap-4">
            <p class="m-0 text-muted-color">Escolha as remessas para separar junto. Os materiais em comum aparecem na mesma linha, com uma quantidade para cada remessa. Cada remessa continua sendo concluída e conferida separadamente.</p>

            <Message v-if="loadError" severity="error">
                <div class="flex flex-wrap items-center gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
                </div>
            </Message>
            <Message v-for="failure in failures" :key="failure" severity="error" size="small">{{ failure }}</Message>

            <DataTable v-model:selection="selected" :value="filtered" :loading="loading" dataKey="uuid" sortField="shippingAt" :sortOrder="1" scrollable scrollHeight="24rem" size="small" stripedRows>
                <template #header>
                    <IconField>
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por remessa, cliente, obra ou veículo" fluid />
                    </IconField>
                </template>
                <template #empty>
                    <div class="py-6 text-center text-muted-color">Nenhuma outra remessa disponível para separar.</div>
                </template>

                <Column selectionMode="multiple" headerStyle="width: 3rem" />
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
                <Column header="Separação" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span v-if="data.picking" class="text-sm">
                            <Tag value="Em andamento" severity="info" class="mr-1" />
                            {{ data.picking.doneItemCount }} de {{ data.itemCount }} itens
                        </span>
                        <span v-else class="text-muted-color">Não iniciada · {{ data.itemCount }} {{ data.itemCount === 1 ? 'item' : 'itens' }}</span>
                    </template>
                </Column>
            </DataTable>

            <Message severity="secondary" size="small" variant="simple">Remessas não iniciadas começam a ser separadas por você. Separações suas já em andamento são trazidas para cá com o que já foi separado.</Message>
        </div>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text :disabled="adding" @click="visible = false" />
            <Button :label="selected.length > 1 ? `Adicionar ${selected.length} remessas` : 'Adicionar remessa'" icon="pi pi-plus" :disabled="!selected.length" :loading="adding" @click="add" />
        </template>
    </Dialog>
</template>
