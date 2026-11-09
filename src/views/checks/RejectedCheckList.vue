<script setup>
import { USER_TYPE } from '@/constants/userType';
import { CheckService } from '@/service/CheckService';
import { useRealtimeRefresh } from '@/service/realtime';
import { session } from '@/service/session';
import { formatDateTime } from '@/utils/date';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const checks = ref([]);
const loading = ref(true);
const loadError = ref('');

const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

function shipmentLabel(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

/** The Administrador opens the shipment; the Encarregado, who has no shipment pages, opens the batch to reassign it */
function openShipment(check, shipment) {
    if (session.hasUserType([USER_TYPE.ADMINISTRATOR])) router.push({ name: 'shipment', params: { shipmentUuid: shipment.uuid } });
    else router.push({ name: 'assignment', params: { batchUuid: check.batchUuid } });
}

function formatQty(qty) {
    return qty === null ? '—' : qtyFormat.format(qty);
}

let loadSeq = 0;

/** `silent`: a refetch pushed by the server, without the loading overlay; a failure keeps the current list. */
async function load({ silent = false } = {}) {
    const seq = ++loadSeq;
    if (!silent) {
        loading.value = true;
        loadError.value = '';
    }
    try {
        const result = await CheckService.listRejected();
        // Only the latest request applies, so a slow response never overwrites a newer list
        if (seq === loadSeq) {
            checks.value = result;
            loadError.value = '';
        }
    } catch (error) {
        if (!silent && seq === loadSeq) loadError.value = error.message;
    } finally {
        if (seq === loadSeq) loading.value = false;
    }
}

// Checks start and finish on the same events as the check queue: a rejected check lists the batch, a recount
// shows who is counting, an approval takes it off
useRealtimeRefresh('checkQueue.changed', () => load({ silent: true }));

onMounted(load);
</script>

<template>
    <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
                <h2 class="text-2xl font-semibold m-0">Conferências com divergência</h2>
                <p class="text-muted-color m-0 mt-1">Conferências que não bateram com o que foi separado. A separação continua disponível para uma nova conferência e sai daqui quando uma delas for aprovada.</p>
            </div>
            <Button label="Atualizar" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load()" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load()" />
            </div>
        </Message>

        <DataTable :value="checks" :loading="loading" dataKey="uuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhuma conferência com divergência.</div>
            </template>

            <Column header="Remessa" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid">
                        <Button :label="shipmentLabel(shipment)" link class="p-0 font-medium" @click="openShipment(data, shipment)" />
                        <div class="text-xs text-muted-color">{{ shipment.customer ?? '—' }}</div>
                    </div>
                    <Tag v-if="data.shipments.length > 1" value="Conferidas juntas" icon="pi pi-link" severity="secondary" class="mt-1" />
                </template>
            </Column>
            <Column header="Divergências">
                <template #body="{ data }">
                    <ul class="m-0 p-0 list-none flex flex-col gap-1">
                        <li v-for="divergence in data.divergences" :key="divergence.materialUuid" class="text-sm">
                            <span class="font-medium">{{ divergence.materialCode }}</span>
                            <span class="text-muted-color"> · {{ divergence.materialDescription }}</span>
                            <div>
                                conferido <strong>{{ formatQty(divergence.countedQty) }}</strong> · separado <strong>{{ formatQty(divergence.pickedQty) }}</strong>
                            </div>
                            <!-- The count covers every shipment together; the picked quantity is known per shipment -->
                            <div v-if="divergence.shipments.length > 1" class="text-xs text-muted-color">
                                <span v-for="(shipment, index) in divergence.shipments" :key="shipment.uuid"> <template v-if="index">; </template>{{ shipmentLabel(shipment) }}: separado {{ formatQty(shipment.pickedQty) }} </span>
                            </div>
                        </li>
                    </ul>
                </template>
            </Column>
            <Column header="Conferente" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div>{{ data.userName }}</div>
                    <div class="text-xs text-muted-color">{{ formatDateTime(data.finishedAt) }}</div>
                </template>
            </Column>
            <Column header="Separador" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div>{{ data.picking.userName }}</div>
                    <div class="text-xs text-muted-color">{{ formatDateTime(data.picking.finishedAt) }}</div>
                </template>
            </Column>
            <Column header="Situação" class="whitespace-nowrap">
                <template #body="{ data }">
                    <Tag v-if="data.recountUserName" :value="`Reconferência por ${data.recountUserName}`" severity="info" />
                    <Tag v-else value="Aguardando reconferência" severity="warn" />
                </template>
            </Column>
        </DataTable>
    </div>
</template>
