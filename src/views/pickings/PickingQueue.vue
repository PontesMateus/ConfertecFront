<script setup>
import { PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
import { PickingService } from '@/service/PickingService';
import { useRealtimeRefresh } from '@/service/realtime';
import { formatDateTime } from '@/utils/date';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

/** One entry per batch assigned to the user, with each shipment's picking progress */
const batches = ref([]);
const loading = ref(true);
const loadError = ref('');
const search = ref('');

const filteredBatches = computed(() => {
    const term = normalize(search.value.trim());
    if (!term) return batches.value;
    return batches.value.filter((batch) => batch.shipments.some((shipment) => [label(shipment), shipment.customer, shipment.venture, shipment.vehicle].some((value) => value && normalize(value).includes(term))));
});

/** Case- and accent-insensitive comparison, so "construcao" finds "Construção". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function label(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

/** Earliest shipping time of the batch, to sort by what leaves first */
function firstShippingAt(batch) {
    return batch.shipments.map((shipment) => shipment.shippingAt).sort()[0];
}

const sortedBatches = computed(() => [...filteredBatches.value].sort((a, b) => firstShippingAt(a).localeCompare(firstShippingAt(b))));

let loadSeq = 0;

/** `silent`: a refetch pushed by the server, without the loading overlay; a failure keeps the current list. */
async function load({ silent = false } = {}) {
    const seq = ++loadSeq;
    if (!silent) {
        loading.value = true;
        loadError.value = '';
    }
    try {
        const result = await PickingService.listMine();
        // Only the latest request applies, so a slow response never overwrites a newer list
        if (seq === loadSeq) {
            batches.value = result;
            loadError.value = '';
        }
    } catch (error) {
        if (!silent && seq === loadSeq) loadError.value = error.message;
    } finally {
        if (seq === loadSeq) loading.value = false;
    }
}

// A batch was assigned to the user, reassigned, changed, or an issue was reported or resolved
useRealtimeRefresh('pickingQueue.changed', () => load({ silent: true }));

function openBatch(batch) {
    router.push({ name: 'picking', params: { batchUuid: batch.uuid } });
}

onMounted(load);
</script>

<template>
    <div class="card mb-0">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
                <h1 class="text-2xl font-semibold m-0">Minhas separações</h1>
                <p class="text-muted-color m-0 mt-1">Remessas que o encarregado atribuiu a você, da saída mais próxima para a mais distante. Remessas do mesmo grupo são separadas juntas.</p>
            </div>
            <Button label="Atualizar" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load()" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load()" />
            </div>
        </Message>

        <DataTable :value="sortedBatches" :loading="loading" dataKey="uuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
            <template #header>
                <div class="flex justify-end">
                    <IconField class="w-full sm:w-80">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por remessa, cliente, obra ou veículo" fluid />
                    </IconField>
                </div>
            </template>

            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhuma separação atribuída a você.</div>
            </template>

            <Column header="Remessa" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid">
                        <span class="font-medium">{{ shipment.record }}</span>
                        <span class="text-muted-color">-{{ shipment.recordReceipt }}</span>
                    </div>
                    <Tag v-if="data.shipments.length > 1" :value="`${data.shipments.length} remessas juntas`" icon="pi pi-link" severity="secondary" class="mt-1" />
                </template>
            </Column>
            <Column header="Saída" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid">{{ formatDateTime(shipment.shippingAt) }}</div>
                </template>
            </Column>
            <Column header="Cliente">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid">{{ shipment.customer ?? '—' }}</div>
                </template>
            </Column>
            <Column header="Obra">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid">{{ shipment.venture ?? '—' }}</div>
                </template>
            </Column>
            <Column header="Veículo" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid">
                        <span v-if="shipment.vehicle">{{ shipment.vehicle }}</span>
                        <Tag v-else value="Não informado" icon="pi pi-exclamation-triangle" severity="warn" />
                    </div>
                </template>
            </Column>
            <Column header="Separação" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid" class="flex flex-col gap-1 min-w-36 mb-2 last:mb-0">
                        <span class="text-sm">
                            <Tag :value="shipment.picking.status" :severity="PICKING_STATUS_SEVERITY[shipment.picking.status]" />
                            <span class="text-xs text-muted-color ml-1">{{ shipment.picking.doneItemCount }} de {{ shipment.itemCount }} itens</span>
                        </span>
                        <Tag
                            v-if="shipment.picking.openIssueCount"
                            :value="shipment.picking.openIssueCount === 1 ? '1 falta pendente' : `${shipment.picking.openIssueCount} faltas pendentes`"
                            icon="pi pi-exclamation-triangle"
                            severity="warn"
                            class="self-start"
                        />
                    </div>
                </template>
            </Column>
            <Column header="" class="w-0 whitespace-nowrap">
                <template #body="{ data }">
                    <div class="flex justify-end">
                        <Button v-if="data.started" label="Continuar" icon="pi pi-arrow-right" iconPos="right" size="small" severity="contrast" @click="openBatch(data)" />
                        <Button v-else label="Abrir" icon="pi pi-play" size="small" @click="openBatch(data)" />
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>
</template>
