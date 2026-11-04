<script setup>
import { PickingService } from '@/service/PickingService';
import { computed, reactive, ref, watch } from 'vue';

// Same limit as the API (PickingController)
const DESCRIPTION_MAX_LENGTH = 1000;

const props = defineProps({
    pickingUuid: { type: String, required: true },
    /** Picking item with the shortage; its remainingQty caps the quantity */
    item: { type: Object, default: null }
});
const emit = defineEmits(['reported']);
const visible = defineModel('visible', { type: Boolean, default: false });

const issueTypes = ref([]);
const form = reactive({ issueTypeUuid: null, qty: null, description: '' });
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

watch(visible, async (open) => {
    if (!open || !props.item) return;
    form.issueTypeUuid = null;
    // Usually the whole rest is missing; the picker lowers it for a partial shortage
    form.qty = props.item.remainingQty;
    form.description = '';
    submitted.value = false;
    errorMessage.value = '';
    if (!issueTypes.value.length) {
        try {
            issueTypes.value = await PickingService.listIssueTypes();
        } catch (error) {
            errorMessage.value = error.message;
        }
    }
});

const errors = computed(() => ({
    issueTypeUuid: !form.issueTypeUuid && 'Escolha o motivo',
    qty: !(form.qty > 0) && 'Informe a quantidade em falta'
}));

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (errors.value.issueTypeUuid || errors.value.qty) return;

    saving.value = true;
    try {
        const picking = await PickingService.reportIssue(props.pickingUuid, {
            lineUuid: props.item.lineUuid,
            issueTypeUuid: form.issueTypeUuid,
            qty: form.qty,
            description: form.description
        });
        emit('reported', picking, props.item);
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Informar falta" modal :closable="!saving" :style="{ width: '32rem' }" :breakpoints="{ '575px': '95vw' }">
        <form v-if="item" id="picking-issue-form" class="flex flex-col gap-4" @submit.prevent="save">
            <div class="p-3 rounded-border bg-surface-100 dark:bg-surface-800">
                <div class="font-medium">{{ item.materialCode }} · {{ item.materialDescription }}</div>
                <div class="text-sm text-muted-color mt-1">
                    Remessa {{ qtyFormat.format(item.requiredQty) }} · separado {{ qtyFormat.format(item.pickedQty) }}
                    <template v-if="item.missingQty"> · falta já informada {{ qtyFormat.format(item.missingQty) }}</template>
                    · restante <strong class="text-color">{{ qtyFormat.format(item.remainingQty) }}</strong>
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <label for="issue-type" class="font-medium">Motivo</label>
                <Select inputId="issue-type" v-model="form.issueTypeUuid" :options="issueTypes" optionLabel="description" optionValue="uuid" placeholder="Escolha o motivo" :invalid="submitted && !!errors.issueTypeUuid" fluid />
                <small v-if="submitted && errors.issueTypeUuid" class="text-red-500">{{ errors.issueTypeUuid }}</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="issue-qty" class="font-medium">Quantidade em falta</label>
                <InputNumber inputId="issue-qty" v-model="form.qty" :min="0" :max="item.remainingQty" :maxFractionDigits="3" locale="pt-BR" showButtons :invalid="submitted && !!errors.qty" fluid />
                <small v-if="submitted && errors.qty" class="text-red-500">{{ errors.qty }}</small>
                <small v-else class="text-muted-color">No máximo o restante a separar ({{ qtyFormat.format(item.remainingQty) }}).</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="issue-description" class="font-medium">Observação <span class="text-muted-color font-normal">(opcional)</span></label>
                <Textarea id="issue-description" v-model="form.description" :maxlength="DESCRIPTION_MAX_LENGTH" rows="3" autoResize placeholder="Ex.: só havia 8 no estoque" fluid />
            </div>

            <Message severity="secondary" size="small" variant="simple">Você pode continuar separando os outros itens, mas a separação só pode ser concluída depois que o administrador resolver a falta.</Message>
            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text :disabled="saving" @click="visible = false" />
            <Button type="submit" form="picking-issue-form" label="Informar falta" icon="pi pi-exclamation-triangle" severity="warn" :loading="saving" />
        </template>
    </Dialog>
</template>
