<script setup>
import { MaterialService } from '@/service/MaterialService';
import { computed, reactive, ref, watch } from 'vue';

// Column sizes in ConfertecData/migrations/003_material.sql
const CODE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

const props = defineProps({
    /** Material being edited; null to create a new one */
    material: { type: Object, default: null }
});
const emit = defineEmits(['saved']);
const visible = defineModel('visible', { type: Boolean, default: false });

const form = reactive({ code: '', description: '' });
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

// The code is the material's identity and can only be set on creation
const isEdit = computed(() => Boolean(props.material));

watch(visible, (open) => {
    if (!open) return;
    form.code = props.material?.code ?? '';
    form.description = props.material?.description ?? '';
    submitted.value = false;
    errorMessage.value = '';
});

const errors = computed(() => ({
    code: !isEdit.value && !form.code.trim() && 'Informe o código',
    description: !form.description.trim() && 'Informe a descrição'
}));

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (errors.value.code || errors.value.description) return;

    const description = form.description.trim();
    saving.value = true;
    try {
        const saved = isEdit.value ? await MaterialService.update(props.material.uuid, { description }) : await MaterialService.create({ code: form.code.trim(), description });
        emit('saved', saved, isEdit.value);
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" :header="isEdit ? 'Editar material' : 'Novo material'" modal :style="{ width: '34rem' }" :breakpoints="{ '575px': '95vw' }">
        <form id="material-form" class="flex flex-col gap-4" @submit.prevent="save">
            <div class="flex flex-col gap-2">
                <label for="material-code" class="font-medium">Código</label>
                <InputText id="material-code" v-model="form.code" :maxlength="CODE_MAX_LENGTH" :disabled="isEdit" :invalid="submitted && !!errors.code" :autofocus="!isEdit" autocomplete="off" fluid />
                <small v-if="isEdit" class="text-muted-color">O código não pode ser alterado.</small>
                <small v-else-if="submitted && errors.code" class="text-red-500">{{ errors.code }}</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="material-description" class="font-medium">Descrição</label>
                <Textarea id="material-description" v-model="form.description" :maxlength="DESCRIPTION_MAX_LENGTH" rows="3" autoResize :autofocus="isEdit" :invalid="submitted && !!errors.description" fluid />
                <div class="flex justify-between gap-2">
                    <small v-if="submitted && errors.description" class="text-red-500">{{ errors.description }}</small>
                    <small class="text-muted-color ml-auto">{{ form.description.length }}/{{ DESCRIPTION_MAX_LENGTH }}</small>
                </div>
            </div>

            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text @click="visible = false" />
            <Button type="submit" form="material-form" :label="isEdit ? 'Salvar' : 'Criar material'" icon="pi pi-check" :loading="saving" />
        </template>
    </Dialog>
</template>
