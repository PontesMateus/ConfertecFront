<script setup>
import { PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
import { CheckService } from '@/service/CheckService';
import { ShipmentService } from '@/service/ShipmentService';
import { formatDate, formatDateTime } from '@/utils/date';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PickingIssueList from '@/views/issues/PickingIssueList.vue';
import ShipmentFormDialog from './ShipmentFormDialog.vue';

const props = defineProps({
    shipmentUuid: { type: String, required: true }
});

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const shipment = ref(null);
/** Checks of the shipment's pickings, newest first */
const checks = ref([]);
const loading = ref(true);
const loadError = ref('');
const formVisible = ref(false);

const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const label = computed(() => shipment.value && `${shipment.value.record}-${shipment.value.recordReceipt}`);

const CHECK_STATUS = {
    open: { label: 'Em andamento', severity: 'info' },
    approved: { label: 'Aprovada', severity: 'success' },
    rejected: { label: 'Com divergência', severity: 'danger' }
};

/** Check status for the header, from the latest check */
const checkStatus = computed(() => {
    const latest = checks.value[0];
    if (latest) {
        const status = CHECK_STATUS[latest.status];
        return { ...status, detail: latest.status === 'open' ? `por ${latest.userName}` : null };
    }
    if (shipment.value?.pickingStatus === 'Concluída') return { label: 'Aguardando conferência', severity: 'warn', detail: null };
    return null;
});

const headerFields = computed(() => [
    { label: 'Emissão', value: formatDate(shipment.value.issueDate) },
    { label: 'Saída', value: formatDateTime(shipment.value.shippingAt) },
    { label: 'Cliente', value: shipment.value.customer },
    { label: 'Obra', value: shipment.value.venture },
    { label: 'Importada em', value: formatDateTime(shipment.value.createdAt) }
]);

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        [shipment.value, checks.value] = await Promise.all([ShipmentService.get(props.shipmentUuid), CheckService.listByShipment(props.shipmentUuid)]);
        document.title = `Remessa ${label.value} | Confertec`;
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

function onSaved(saved) {
    // The header response carries no items or revisions; keep the loaded ones
    shipment.value = { ...shipment.value, ...saved };
    toast.add({ severity: 'success', summary: 'Remessa atualizada', detail: label.value, life: 3000 });
}

function confirmDelete() {
    confirm.require({
        header: 'Excluir remessa',
        message: `A remessa ${label.value} e todas as suas revisões serão excluídas definitivamente. Deseja continuar?`,
        icon: 'pi pi-trash',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Excluir', severity: 'danger' },
        accept: deleteShipment
    });
}

async function deleteShipment() {
    try {
        await ShipmentService.delete(props.shipmentUuid);
        toast.add({ severity: 'success', summary: 'Remessa excluída', detail: label.value, life: 3000 });
        router.push({ name: 'shipments' });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível excluir', detail: error.message, life: 5000 });
        load();
    }
}

watch(() => props.shipmentUuid, load, { immediate: true });
</script>

<template>
    <div class="flex flex-col gap-6">
        <div class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <Button icon="pi pi-arrow-left" severity="secondary" text rounded aria-label="Voltar para remessas" v-tooltip.bottom="'Voltar para remessas'" @click="router.push({ name: 'shipments' })" />
                    <div>
                        <h1 class="text-2xl font-semibold m-0">
                            Remessa <span v-if="shipment">{{ label }}</span>
                        </h1>
                        <div v-if="shipment" class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-1 text-muted-color">
                            <span>Revisão {{ shipment.revisionNumber ?? '—' }}</span>
                            <span class="flex items-center gap-1">
                                Separação:
                                <Tag v-if="shipment.pickingStatus" :value="shipment.pickingStatus" :severity="PICKING_STATUS_SEVERITY[shipment.pickingStatus]" />
                                <span v-else class="text-color">não iniciada</span>
                            </span>
                            <span class="flex items-center gap-1">
                                Conferência:
                                <template v-if="checkStatus">
                                    <Tag :value="checkStatus.label" :severity="checkStatus.severity" />
                                    <span v-if="checkStatus.detail">{{ checkStatus.detail }}</span>
                                </template>
                                <span v-else class="text-color">não iniciada</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div v-if="shipment" class="flex gap-2">
                    <Button label="Editar" icon="pi pi-pencil" severity="secondary" outlined @click="formVisible = true" />
                    <Button v-if="!shipment.picked" label="Excluir" icon="pi pi-trash" severity="danger" outlined @click="confirmDelete" />
                </div>
            </div>

            <Message v-if="loadError" severity="error" class="mt-4">
                <div class="flex flex-wrap items-center gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
                </div>
            </Message>

            <div v-if="loading && !shipment" class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                <Skeleton v-for="n in 7" :key="n" height="2.75rem" />
            </div>

            <dl v-else-if="shipment" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 mt-6 mb-0">
                <div v-for="field in headerFields" :key="field.label">
                    <dt class="text-sm text-muted-color">{{ field.label }}</dt>
                    <dd class="m-0 mt-1 font-medium">{{ field.value || '—' }}</dd>
                </div>
                <div>
                    <dt class="text-sm text-muted-color">Veículo</dt>
                    <dd class="m-0 mt-1 font-medium">
                        <span v-if="shipment.vehicle">{{ shipment.vehicle }}</span>
                        <Tag v-else value="Não informado" icon="pi pi-exclamation-triangle" severity="warn" />
                    </dd>
                </div>
            </dl>

            <Message v-if="shipment && !shipment.vehicle" severity="warn" class="mt-6">
                <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                    <span><strong>Veículo não identificado.</strong> O veículo não vem do Sisloc e deve ser informado antes da separação.</span>
                    <Button label="Informar veículo" icon="pi pi-truck" size="small" severity="warn" @click="formVisible = true" />
                </div>
            </Message>
        </div>

        <div v-if="shipment" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Itens da revisão atual</h2>
            <DataTable :value="shipment.items" dataKey="lineUuid" stripedRows size="small">
                <template #empty>
                    <div class="py-6 text-center text-muted-color">Esta revisão não tem itens.</div>
                </template>
                <Column field="materialCode" header="Código" sortable class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.materialCode }}</span>
                        <Tag v-if="data.replacedLineUuid" :value="`Substitui ${data.replacedMaterialCode}`" icon="pi pi-arrow-right-arrow-left" severity="info" class="ml-2" />
                    </template>
                </Column>
                <Column field="materialDescription" header="Descrição" sortable />
                <Column field="qty" header="Quantidade" sortable class="text-right whitespace-nowrap">
                    <template #body="{ data }">{{ qtyFormat.format(data.qty) }}</template>
                </Column>
            </DataTable>
        </div>

        <!-- A resolution may create a revision: reload items and revisions -->
        <PickingIssueList v-if="shipment?.picked" :shipmentUuid="shipmentUuid" @resolved="load" />

        <div v-if="shipment && checks.length" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Conferências</h2>
            <DataTable :value="checks" dataKey="uuid" size="small">
                <Column header="Conferente" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <div class="font-medium">{{ data.userName }}</div>
                        <div class="text-xs text-muted-color">Iniciada em {{ formatDateTime(data.createdAt) }}</div>
                    </template>
                </Column>
                <Column header="Situação" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <Tag :value="CHECK_STATUS[data.status].label" :severity="CHECK_STATUS[data.status].severity" />
                        <div v-if="data.finishedAt" class="text-xs text-muted-color mt-1">Finalizada em {{ formatDateTime(data.finishedAt) }}</div>
                        <div v-else class="text-xs text-muted-color mt-1">{{ data.countedCount }} de {{ data.itemCount }} itens contados</div>
                    </template>
                </Column>
                <Column header="Divergências">
                    <template #body="{ data }">
                        <span v-if="data.status === 'open'" class="text-muted-color">—</span>
                        <span v-else-if="!data.divergences.length" class="text-muted-color">Nenhuma</span>
                        <ul v-else class="m-0 p-0 list-none flex flex-col gap-1">
                            <li v-for="divergence in data.divergences" :key="divergence.lineUuid" class="text-sm">
                                <span class="font-medium">{{ divergence.materialCode }}</span>
                                <span class="text-muted-color"> · {{ divergence.materialDescription }}</span>
                                <div>
                                    conferido <strong>{{ divergence.countedQty === null ? '—' : qtyFormat.format(divergence.countedQty) }}</strong> · separado
                                    <strong>{{ qtyFormat.format(divergence.pickedQty) }}</strong>
                                </div>
                            </li>
                        </ul>
                    </template>
                </Column>
                <Column header="Acompanhamento" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <template v-if="data.finishedAt">
                            <div>{{ data.customerInspection ? 'Com o cliente' : 'Sem o cliente' }}</div>
                            <div class="text-xs text-muted-color">Temec: {{ data.companyPersonQty }} · cliente: {{ data.customerPersonQty }}</div>
                        </template>
                        <span v-else class="text-muted-color">—</span>
                    </template>
                </Column>
            </DataTable>
        </div>

        <div v-if="shipment" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Revisões</h2>
            <DataTable :value="shipment.revisions" dataKey="uuid" size="small">
                <template #empty>
                    <div class="py-6 text-center text-muted-color">Nenhuma revisão.</div>
                </template>
                <Column field="number" header="Nº" class="w-0 whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.number }}</span>
                        <Tag v-if="data.current" value="Atual" class="ml-2" />
                    </template>
                </Column>
                <Column field="reason" header="Motivo" class="whitespace-nowrap" />
                <Column field="note" header="Observação">
                    <template #body="{ data }">{{ data.note || '—' }}</template>
                </Column>
                <Column field="userName" header="Usuário" class="whitespace-nowrap" />
                <Column field="createdAt" header="Data" class="whitespace-nowrap">
                    <template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template>
                </Column>
            </DataTable>
        </div>
    </div>

    <ShipmentFormDialog v-model:visible="formVisible" :shipment="shipment" @saved="onSaved" />
</template>
