<script setup>
import { PickingBatchService } from '@/service/PickingBatchService';
import { formatDateTime } from '@/utils/date';
import { computed, reactive, ref, watch } from 'vue';

const props = defineProps({
    /** Shipments not assigned yet that go into the batch, picked and checked together */
    shipments: { type: Array, required: true },
    /** Active Conferentes: { uuid, name, login } */
    users: { type: Array, required: true }
});
const emit = defineEmits(['created']);
const visible = defineModel('visible', { type: Boolean, default: false });

const form = reactive({ pickerUuid: null, checkerUuid: null });
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

watch(visible, (open) => {
    if (!open) return;
    Object.assign(form, { pickerUuid: null, checkerUuid: null });
    submitted.value = false;
    errorMessage.value = '';
});

// The check is blind: whoever picks a batch never checks it
const checkerOptions = computed(() => props.users.filter((user) => user.uuid !== form.pickerUuid));
watch(
    () => form.pickerUuid,
    (pickerUuid) => {
        if (form.checkerUuid === pickerUuid) form.checkerUuid = null;
    }
);

const errors = computed(() => ({
    pickerUuid: !form.pickerUuid && 'Selecione quem vai separar'
}));

function label(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (errors.value.pickerUuid) return;

    saving.value = true;
    try {
        const batch = await PickingBatchService.create({
            shipmentUuids: props.shipments.map((shipment) => shipment.uuid),
            pickerUuid: form.pickerUuid,
            checkerUuid: form.checkerUuid ?? undefined
        });
        emit('created', batch);
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Atribuir separação" modal :style="{ width: '34rem' }" :breakpoints="{ '575px': '95vw' }">
        <form id="batch-form" class="flex flex-col gap-4" @submit.prevent="save">
            <div class="flex flex-col gap-2">
                <span class="font-medium">{{ shipments.length === 1 ? 'Remessa' : `${shipments.length} remessas, separadas e conferidas juntas` }}</span>
                <ul class="m-0 p-0 list-none flex flex-col gap-1">
                    <li v-for="shipment in shipments" :key="shipment.uuid" class="text-sm">
                        <span class="font-medium">{{ label(shipment) }}</span>
                        <span class="text-muted-color"> · {{ shipment.customer ?? '—' }} · saída {{ formatDateTime(shipment.shippingAt) }}</span>
                    </li>
                </ul>
            </div>

            <div class="flex flex-col gap-2">
                <label for="batch-picker" class="font-medium">Separador</label>
                <Select inputId="batch-picker" v-model="form.pickerUuid" :options="users" optionLabel="name" optionValue="uuid" placeholder="Selecione" filter :invalid="submitted && !!errors.pickerUuid" fluid />
                <small v-if="submitted && errors.pickerUuid" class="text-red-500">{{ errors.pickerUuid }}</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="batch-checker" class="font-medium">Conferente <span class="text-muted-color font-normal">(opcional)</span></label>
                <Select inputId="batch-checker" v-model="form.checkerUuid" :options="checkerOptions" optionLabel="name" optionValue="uuid" placeholder="Atribuir depois" filter showClear fluid />
                <small class="text-muted-color">A conferência é cega: o separador não pode conferir o mesmo grupo.</small>
            </div>

            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text @click="visible = false" />
            <Button type="submit" form="batch-form" label="Atribuir" icon="pi pi-check" :loading="saving" />
        </template>
    </Dialog>
</template>
