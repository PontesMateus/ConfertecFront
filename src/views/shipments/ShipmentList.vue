<script setup>
import { PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
import { ShipmentService } from '@/service/ShipmentService';
import { formatDateTime, toIsoDate } from '@/utils/date';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ShipmentFormDialog from './ShipmentFormDialog.vue';
import ShipmentImportDialog from './ShipmentImportDialog.vue';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const shipments = ref([]);
const loading = ref(true);
const loadError = ref('');

const search = ref('');
/** [from, to] shipping dates, sent to the API; a single picked day means that day only */
const shippingDates = ref(null);

const formVisible = ref(false);
const importVisible = ref(false);
const selectedShipment = ref(null);

/** The vehicle never comes from Sisloc: the administrator fills it after the import */
const onlyWithoutVehicle = ref(false);
const withoutVehicleCount = computed(() => shipments.value.filter((shipment) => !shipment.vehicle).length);

const filteredShipments = computed(() => {
    const term = normalize(search.value.trim());
    const listed = onlyWithoutVehicle.value ? shipments.value.filter((shipment) => !shipment.vehicle) : shipments.value;
    if (!term) return listed;
    return listed.filter((shipment) => [shipmentLabel(shipment), shipment.customer, shipment.venture, shipment.vehicle].some((value) => value && normalize(value).includes(term)));
});

/** Case- and accent-insensitive comparison, so "construcao" finds "Construção". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function load() {
    loading.value = true;
    loadError.value = '';
    const [from, to] = shippingDates.value ?? [];
    try {
        shipments.value = await ShipmentService.list({ shippingDateFrom: toIsoDate(from), shippingDateTo: toIsoDate(to ?? from) });
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

function onShippingDatesChange() {
    const [from, to] = shippingDates.value ?? [];
    // Wait for the second click of the range, unless the field was cleared
    if (from && !to) return;
    load();
}

function clearShippingDates() {
    shippingDates.value = null;
    load();
}

function openDetail(shipment) {
    router.push({ name: 'shipment', params: { shipmentUuid: shipment.uuid } });
}

function openEdit(shipment) {
    selectedShipment.value = shipment;
    formVisible.value = true;
}

function onImported(shipment) {
    toast.add({ severity: 'success', summary: 'Remessa importada', detail: `${shipmentLabel(shipment)}: informe o veículo`, life: 5000 });
    router.push({ name: 'shipment', params: { shipmentUuid: shipment.uuid } });
}

function onSaved(saved) {
    const index = shipments.value.findIndex((shipment) => shipment.uuid === saved.uuid);
    if (index !== -1) shipments.value.splice(index, 1, saved);
    if (!withoutVehicleCount.value) onlyWithoutVehicle.value = false;
    toast.add({ severity: 'success', summary: 'Remessa atualizada', detail: shipmentLabel(saved), life: 3000 });
}

function shipmentLabel(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

function confirmDelete(shipment) {
    confirm.require({
        header: 'Excluir remessa',
        message: `A remessa ${shipmentLabel(shipment)} e todas as suas revisões serão excluídas definitivamente. Deseja continuar?`,
        icon: 'pi pi-trash',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Excluir', severity: 'danger' },
        accept: () => deleteShipment(shipment)
    });
}

async function deleteShipment(shipment) {
    try {
        await ShipmentService.delete(shipment.uuid);
        shipments.value = shipments.value.filter((item) => item.uuid !== shipment.uuid);
        toast.add({ severity: 'success', summary: 'Remessa excluída', detail: shipmentLabel(shipment), life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível excluir', detail: error.message, life: 5000 });
        // A picking may have started meanwhile: refresh its status
        load();
    }
}

onMounted(load);
</script>

<template>
    <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
                <h1 class="text-2xl font-semibold m-0">Remessas</h1>
                <p class="text-muted-color m-0 mt-1">Remessas importadas do Sisloc. Só podem ser excluídas enquanto nenhuma separação foi iniciada.</p>
            </div>
            <Button label="Importar remessa" icon="pi pi-upload" @click="importVisible = true" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
            </div>
        </Message>

        <Message v-if="withoutVehicleCount" severity="warn" class="mb-4">
            <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                <span>
                    <strong>{{ withoutVehicleCount }} {{ withoutVehicleCount === 1 ? 'remessa' : 'remessas' }} sem veículo identificado.</strong>
                    O veículo não vem do Sisloc e deve ser informado após a importação.
                </span>
                <Button :label="onlyWithoutVehicle ? 'Mostrar todas' : 'Mostrar só essas'" size="small" severity="warn" outlined @click="onlyWithoutVehicle = !onlyWithoutVehicle" />
            </div>
        </Message>

        <DataTable :value="filteredShipments" :loading="loading" dataKey="uuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows rowHover class="cursor-pointer" @row-click="openDetail($event.data)">
            <template #header>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <DatePicker v-model="shippingDates" selectionMode="range" dateFormat="dd/mm/yy" placeholder="Data de saída" showIcon :manualInput="false" class="w-64" @update:modelValue="onShippingDatesChange" />
                        <Button v-if="shippingDates" icon="pi pi-filter-slash" severity="secondary" text rounded aria-label="Limpar datas" v-tooltip.top="'Limpar datas'" @click="clearShippingDates" />
                    </div>
                    <IconField class="w-full sm:w-80">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por registro, cliente, obra ou veículo" fluid />
                    </IconField>
                </div>
            </template>

            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhuma remessa encontrada.</div>
            </template>

            <Column field="record" header="Registro" sortable class="whitespace-nowrap">
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
                    <Tag v-else value="Não informado" icon="pi pi-exclamation-triangle" severity="warn" class="cursor-pointer" v-tooltip.top="'Clique para informar o veículo'" @click.stop="openEdit(data)" />
                </template>
            </Column>
            <Column field="itemCount" header="Itens" sortable class="text-right" />
            <Column field="revisionNumber" header="Revisão" sortable class="text-right">
                <template #body="{ data }">{{ data.revisionNumber ?? '—' }}</template>
            </Column>
            <Column field="pickingStatus" header="Separação" sortable class="whitespace-nowrap">
                <template #body="{ data }">
                    <Tag v-if="data.pickingStatus" :value="data.pickingStatus" :severity="PICKING_STATUS_SEVERITY[data.pickingStatus]" />
                    <span v-else class="text-muted-color">Não iniciada</span>
                </template>
            </Column>
            <Column header="Ações" class="w-0 whitespace-nowrap">
                <template #body="{ data }">
                    <div class="flex gap-1 justify-end" @click.stop>
                        <Button icon="pi pi-eye" severity="secondary" text rounded aria-label="Ver itens" v-tooltip.top="'Ver itens'" @click="openDetail(data)" />
                        <Button icon="pi pi-pencil" severity="secondary" text rounded aria-label="Editar" v-tooltip.top="'Editar'" @click="openEdit(data)" />
                        <Button v-if="!data.picked" icon="pi pi-trash" severity="danger" text rounded aria-label="Excluir" v-tooltip.top="'Excluir'" @click="confirmDelete(data)" />
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>

    <ShipmentImportDialog v-model:visible="importVisible" @imported="onImported" />
    <ShipmentFormDialog v-model:visible="formVisible" :shipment="selectedShipment" @saved="onSaved" />
</template>
