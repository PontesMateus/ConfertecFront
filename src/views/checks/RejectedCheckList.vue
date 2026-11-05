<script setup>
import { CheckService } from '@/service/CheckService';
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

function formatQty(qty) {
    return qty === null ? '—' : qtyFormat.format(qty);
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        checks.value = await CheckService.listRejected();
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<template>
    <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
                <h2 class="text-2xl font-semibold m-0">Conferências com divergência</h2>
                <p class="text-muted-color m-0 mt-1">Conferências que não bateram com o que foi separado. A separação continua disponível para uma nova conferência e sai daqui quando uma delas for aprovada.</p>
            </div>
            <Button label="Atualizar" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
            </div>
        </Message>

        <DataTable :value="checks" :loading="loading" dataKey="uuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhuma conferência com divergência.</div>
            </template>

            <Column header="Remessa" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div v-for="shipment in data.shipments" :key="shipment.uuid">
                        <Button :label="shipmentLabel(shipment)" link class="p-0 font-medium" @click="router.push({ name: 'shipment', params: { shipmentUuid: shipment.uuid } })" />
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
