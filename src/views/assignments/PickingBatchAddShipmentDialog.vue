<script setup>
import { PickingBatchService } from '@/service/PickingBatchService';
import { ShipmentService } from '@/service/ShipmentService';
import { formatDateTime } from '@/utils/date';
import { computed, ref, watch } from 'vue';

const props = defineProps({
    batch: { type: Object, default: null }
});
const emit = defineEmits(['added']);
const visible = defineModel('visible', { type: Boolean, default: false });

const shipments = ref([]);
const shipmentUuid = ref(null);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const options = computed(() =>
    shipments.value.map((shipment) => ({
        uuid: shipment.uuid,
        label: `${shipment.record}-${shipment.recordReceipt} · ${shipment.customer ?? '—'} · saída ${formatDateTime(shipment.shippingAt)}`
    }))
);

watch(visible, async (open) => {
    if (!open) return;
    shipmentUuid.value = null;
    errorMessage.value = '';
    loading.value = true;
    try {
        shipments.value = await ShipmentService.list({ unassigned: true });
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        loading.value = false;
    }
});

async function save() {
    if (!shipmentUuid.value) return;
    saving.value = true;
    errorMessage.value = '';
    try {
        emit('added', await PickingBatchService.addShipment(props.batch.uuid, shipmentUuid.value));
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Adicionar remessa ao grupo" modal :style="{ width: '36rem' }" :breakpoints="{ '575px': '95vw' }">
        <form id="add-shipment-form" class="flex flex-col gap-4" @submit.prevent="save">
            <p class="m-0 text-muted-color">A remessa é separada por {{ batch?.userName }} junto com as outras do grupo{{ batch?.started ? ' e já entra em andamento' : '' }}.</p>
            <div class="flex flex-col gap-2">
                <label for="add-shipment" class="font-medium">Remessa sem atribuição</label>
                <Select
                    inputId="add-shipment"
                    v-model="shipmentUuid"
                    :options="options"
                    optionLabel="label"
                    optionValue="uuid"
                    :loading="loading"
                    placeholder="Selecione"
                    filter
                    emptyMessage="Nenhuma remessa sem atribuição"
                    emptyFilterMessage="Nenhuma remessa encontrada"
                    fluid
                />
            </div>
            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text @click="visible = false" />
            <Button type="submit" form="add-shipment-form" label="Adicionar" icon="pi pi-plus" :disabled="!shipmentUuid" :loading="saving" />
        </template>
    </Dialog>
</template>
