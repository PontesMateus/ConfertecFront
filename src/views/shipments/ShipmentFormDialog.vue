<script setup>
import { ShipmentService } from '@/service/ShipmentService';
import { fromIsoDate, toIsoDate } from '@/utils/date';
import { computed, reactive, ref, watch } from 'vue';

// Column sizes in ConfertecData/migrations/004_shipment.sql
const DESCRIPTION_MAX_LENGTH = 255;
const VEHICLE_MAX_LENGTH = 100;

const props = defineProps({
    /** Shipment whose header is edited */
    shipment: { type: Object, default: null }
});
const emit = defineEmits(['saved']);
const visible = defineModel('visible', { type: Boolean, default: false });

const form = reactive({ issueDate: null, shippingAt: null, customer: '', venture: '', vehicle: '' });
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

watch(visible, (open) => {
    if (!open || !props.shipment) return;
    form.issueDate = fromIsoDate(props.shipment.issueDate);
    form.shippingAt = new Date(props.shipment.shippingAt);
    form.customer = props.shipment.customer ?? '';
    form.venture = props.shipment.venture ?? '';
    form.vehicle = props.shipment.vehicle ?? '';
    submitted.value = false;
    errorMessage.value = '';
});

const errors = computed(() => ({
    issueDate: !form.issueDate && 'Informe a data de emissão',
    shippingAt: !form.shippingAt && 'Informe a data e a hora de saída'
}));

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (errors.value.issueDate || errors.value.shippingAt) return;

    saving.value = true;
    try {
        const saved = await ShipmentService.update(props.shipment.uuid, {
            issueDate: toIsoDate(form.issueDate),
            shippingAt: form.shippingAt.toISOString(),
            customer: form.customer,
            venture: form.venture,
            vehicle: form.vehicle
        });
        emit('saved', saved);
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Editar remessa" modal :style="{ width: '40rem' }" :breakpoints="{ '575px': '95vw' }">
        <form v-if="shipment" id="shipment-form" class="flex flex-col gap-4" @submit.prevent="save">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                    <label for="shipment-record" class="font-medium">Registro</label>
                    <InputText id="shipment-record" :modelValue="shipment.record" disabled fluid />
                </div>
                <div class="flex flex-col gap-2">
                    <label for="shipment-receipt" class="font-medium">Recibo</label>
                    <InputText id="shipment-receipt" :modelValue="shipment.recordReceipt" disabled fluid />
                </div>
            </div>
            <small class="text-muted-color -mt-2">Registro e recibo identificam a remessa no Sisloc e não podem ser alterados.</small>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                    <label for="shipment-issue-date" class="font-medium">Emissão</label>
                    <DatePicker inputId="shipment-issue-date" v-model="form.issueDate" dateFormat="dd/mm/yy" showIcon :invalid="submitted && !!errors.issueDate" fluid />
                    <small v-if="submitted && errors.issueDate" class="text-red-500">{{ errors.issueDate }}</small>
                </div>
                <div class="flex flex-col gap-2">
                    <label for="shipment-shipping-date" class="font-medium">Saída (data e hora)</label>
                    <DatePicker inputId="shipment-shipping-date" v-model="form.shippingAt" dateFormat="dd/mm/yy" showTime hourFormat="24" showIcon :invalid="submitted && !!errors.shippingAt" fluid />
                    <small v-if="submitted && errors.shippingAt" class="text-red-500">{{ errors.shippingAt }}</small>
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <label for="shipment-customer" class="font-medium">Cliente</label>
                <InputText id="shipment-customer" v-model="form.customer" :maxlength="DESCRIPTION_MAX_LENGTH" autocomplete="off" fluid />
            </div>

            <div class="flex flex-col gap-2">
                <label for="shipment-venture" class="font-medium">Obra</label>
                <InputText id="shipment-venture" v-model="form.venture" :maxlength="DESCRIPTION_MAX_LENGTH" autocomplete="off" fluid />
            </div>

            <div class="flex flex-col gap-2">
                <label for="shipment-vehicle" class="font-medium">Veículo</label>
                <InputText id="shipment-vehicle" v-model="form.vehicle" :maxlength="VEHICLE_MAX_LENGTH" :autofocus="!shipment.vehicle" placeholder="Placa ou identificação do veículo" autocomplete="off" fluid />
                <small class="text-muted-color">Não vem do Sisloc: informe após a importação.</small>
            </div>

            <Message severity="secondary" size="small" variant="simple">Itens não são editados aqui: mudanças nos itens geram uma nova revisão.</Message>
            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text @click="visible = false" />
            <Button type="submit" form="shipment-form" label="Salvar" icon="pi pi-check" :loading="saving" />
        </template>
    </Dialog>
</template>
