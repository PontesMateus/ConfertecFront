<script setup>
import { PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
import { PickingBatchService } from '@/service/PickingBatchService';
import { ShipmentService } from '@/service/ShipmentService';
import { UserService } from '@/service/UserService';
import { useRealtimeRefresh } from '@/service/realtime';
import { formatDateTime } from '@/utils/date';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PickingBatchFormDialog from './PickingBatchFormDialog.vue';

const router = useRouter();
const toast = useToast();

/** Shipments with a current revision and no batch yet */
const unassigned = ref([]);
/** Batches with work left */
const batches = ref([]);
/** Active Conferentes, to pick from */
const users = ref([]);
const loading = ref(true);
const loadError = ref('');
const selected = ref([]);
const formVisible = ref(false);

function label(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

/** Earliest shipping time of the batch: what leaves first comes first */
function firstShippingAt(batch) {
    return batch.shipments.map((shipment) => shipment.shippingAt).sort()[0] ?? '';
}

const sortedBatches = computed(() => [...batches.value].sort((a, b) => firstShippingAt(a).localeCompare(firstShippingAt(b))));

/** One short status for the batch, from its pickings */
function batchStatus(batch) {
    const statuses = batch.shipments.map((shipment) => shipment.picking.status);
    if (statuses.every((status) => status === 'Pendente')) return 'Pendente';
    if (statuses.every((status) => status === 'Concluída' || status === 'Conferida')) return 'Concluída';
    return 'Em andamento';
}

function openIssueCount(batch) {
    return batch.shipments.reduce((sum, shipment) => sum + shipment.picking.openIssueCount, 0);
}

let loadSeq = 0;

/** `silent`: a refetch pushed by the server, without the loading overlay; a failure keeps the current page. */
async function load({ silent = false } = {}) {
    const seq = ++loadSeq;
    if (!silent) {
        loading.value = true;
        loadError.value = '';
    }
    try {
        const result = await Promise.all([ShipmentService.list({ unassigned: true }), PickingBatchService.list(), UserService.listAssignable()]);
        if (seq !== loadSeq) return;
        [unassigned.value, batches.value, users.value] = result;
        // A shipment assigned meanwhile leaves the selection
        selected.value = selected.value.filter((shipment) => unassigned.value.some((candidate) => candidate.uuid === shipment.uuid));
        loadError.value = '';
    } catch (error) {
        if (!silent && seq === loadSeq) loadError.value = error.message;
    } finally {
        if (seq === loadSeq) loading.value = false;
    }
}

// Shipments imported or assigned, pickings started or finished, checks started or finished
useRealtimeRefresh('pickingQueue.changed', () => load({ silent: true }));
useRealtimeRefresh('checkQueue.changed', () => load({ silent: true }));

function onCreated(batch) {
    selected.value = [];
    toast.add({ severity: 'success', summary: 'Separação atribuída', detail: `${batch.pickings.length === 1 ? 'Remessa' : `${batch.pickings.length} remessas`} para ${batch.userName}`, life: 4000 });
    load({ silent: true });
}

function openBatch(batch) {
    router.push({ name: 'assignment', params: { batchUuid: batch.uuid } });
}

onMounted(load);
</script>

<template>
    <div class="flex flex-col gap-6">
        <div class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl font-semibold m-0">Remessas sem atribuição</h1>
                    <p class="text-muted-color m-0 mt-1">Selecione uma ou mais remessas para atribuir a separação e a conferência. Remessas atribuídas juntas são separadas e conferidas juntas.</p>
                </div>
                <div class="flex gap-2">
                    <Button label="Atualizar" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load()" />
                    <Button :label="selected.length > 1 ? `Atribuir ${selected.length} remessas` : 'Atribuir'" icon="pi pi-user-plus" :disabled="!selected.length || !users.length" @click="formVisible = true" />
                </div>
            </div>

            <Message v-if="loadError" severity="error" class="mb-4">
                <div class="flex flex-wrap items-center gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" @click="load()" />
                </div>
            </Message>
            <Message v-else-if="!loading && !users.length" severity="warn" class="mb-4">Não há usuários do tipo Conferente ativos para atribuir.</Message>

            <DataTable v-model:selection="selected" :value="unassigned" :loading="loading" dataKey="uuid" sortField="shippingAt" :sortOrder="1" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
                <template #empty>
                    <div class="py-6 text-center text-muted-color">Nenhuma remessa aguardando atribuição.</div>
                </template>

                <Column selectionMode="multiple" class="w-0" />
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
                <Column field="itemCount" header="Itens" sortable class="whitespace-nowrap" />
            </DataTable>
        </div>

        <div class="card mb-0">
            <div class="mb-6">
                <h2 class="text-2xl font-semibold m-0">Grupos em andamento</h2>
                <p class="text-muted-color m-0 mt-1">Separações atribuídas que ainda não foram conferidas e aprovadas. Abra um grupo para trocar o separador ou o conferente.</p>
            </div>

            <DataTable :value="sortedBatches" :loading="loading" dataKey="uuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
                <template #empty>
                    <div class="py-6 text-center text-muted-color">Nenhum grupo em andamento.</div>
                </template>

                <Column header="Remessas" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <div v-for="shipment in data.shipments" :key="shipment.uuid">
                            <span class="font-medium">{{ label(shipment) }}</span>
                            <span class="text-xs text-muted-color ml-2">saída {{ formatDateTime(shipment.shippingAt) }}</span>
                        </div>
                    </template>
                </Column>
                <Column header="Separação" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <div class="flex flex-col gap-1">
                            <Tag :value="batchStatus(data)" :severity="PICKING_STATUS_SEVERITY[batchStatus(data)]" class="self-start" />
                            <span class="text-sm">{{ data.userName }}</span>
                            <Tag v-if="openIssueCount(data)" :value="openIssueCount(data) === 1 ? '1 falta pendente' : `${openIssueCount(data)} faltas pendentes`" icon="pi pi-exclamation-triangle" severity="warn" class="self-start" />
                        </div>
                    </template>
                </Column>
                <Column header="Conferência" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span v-if="data.checker">{{ data.checker.name }}</span>
                        <Tag v-else value="Sem conferente" icon="pi pi-exclamation-triangle" severity="warn" />
                    </template>
                </Column>
                <Column header="" class="w-0 whitespace-nowrap">
                    <template #body="{ data }">
                        <div class="flex justify-end">
                            <Button label="Abrir" icon="pi pi-arrow-right" iconPos="right" size="small" severity="secondary" outlined @click="openBatch(data)" />
                        </div>
                    </template>
                </Column>
            </DataTable>
        </div>

        <PickingBatchFormDialog v-model:visible="formVisible" :shipments="selected" :users="users" @created="onCreated" />
    </div>
</template>
