<script setup>
import { PickingBatchService } from '@/service/PickingBatchService';
import { computed, ref, watch } from 'vue';

const JUSTIFICATION_MAX_LENGTH = 1000;

const props = defineProps({
    batch: { type: Object, default: null },
    /** 'PICKER' or 'CHECKER' */
    role: { type: String, required: true },
    /** Active Conferentes: { uuid, name, login } */
    users: { type: Array, required: true },
    /** The work of this role already started: the change needs a justification */
    started: { type: Boolean, default: false }
});
const emit = defineEmits(['saved']);
const visible = defineModel('visible', { type: Boolean, default: false });

const userUuid = ref(null);
const justification = ref('');
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const isPicker = computed(() => props.role === 'PICKER');
const currentUuid = computed(() => (isPicker.value ? props.batch?.userUuid : props.batch?.checker?.uuid));
const header = computed(() => {
    if (isPicker.value) return 'Trocar separador';
    return props.batch?.checker ? 'Trocar conferente' : 'Atribuir conferente';
});

/**
 * The check is blind: anyone ever assigned to the other role of this batch is left out (the API refuses them too),
 * and so is whoever has this role now.
 */
const options = computed(() => {
    const otherRole = isPicker.value ? 'CHECKER' : 'PICKER';
    const blocked = new Set((props.batch?.assignments ?? []).filter((assignment) => assignment.role === otherRole).map((assignment) => assignment.userUuid));
    return props.users.filter((user) => user.uuid !== currentUuid.value && !blocked.has(user.uuid));
});

watch(visible, (open) => {
    if (!open) return;
    userUuid.value = null;
    justification.value = '';
    submitted.value = false;
    errorMessage.value = '';
});

const errors = computed(() => ({
    userUuid: !userUuid.value && 'Selecione o novo responsável',
    justification: props.started && !justification.value.trim() && 'Informe por que a troca é necessária'
}));

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (errors.value.userUuid || errors.value.justification) return;

    saving.value = true;
    try {
        const assign = isPicker.value ? PickingBatchService.assignPicker : PickingBatchService.assignChecker;
        const saved = await assign(props.batch.uuid, userUuid.value, justification.value.trim() || undefined);
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
    <Dialog v-model:visible="visible" :header="header" modal :style="{ width: '32rem' }" :breakpoints="{ '575px': '95vw' }">
        <form id="assign-form" class="flex flex-col gap-4" @submit.prevent="save">
            <p v-if="currentUuid" class="m-0 text-muted-color">
                Atual: <span class="font-medium text-color">{{ isPicker ? batch.userName : batch.checker.name }}</span>
            </p>

            <Message v-if="started" severity="warn" size="small">
                {{ isPicker ? 'A separação já começou. O novo separador continua de onde parou, com o que já foi separado.' : 'A conferência já começou. O novo conferente continua com as contagens já feitas.' }}
            </Message>

            <div class="flex flex-col gap-2">
                <label for="assign-user" class="font-medium">{{ isPicker ? 'Novo separador' : 'Conferente' }}</label>
                <Select inputId="assign-user" v-model="userUuid" :options="options" optionLabel="name" optionValue="uuid" placeholder="Selecione" filter :invalid="submitted && !!errors.userUuid" fluid />
                <small v-if="submitted && errors.userUuid" class="text-red-500">{{ errors.userUuid }}</small>
                <small v-else class="text-muted-color">Quem já {{ isPicker ? 'foi conferente' : 'foi separador' }} deste grupo não aparece: a conferência é cega.</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="assign-justification" class="font-medium"> Justificativa <span v-if="!started" class="text-muted-color font-normal">(opcional)</span> </label>
                <Textarea id="assign-justification" v-model="justification" rows="3" :maxlength="JUSTIFICATION_MAX_LENGTH" autoResize :invalid="submitted && !!errors.justification" fluid />
                <small v-if="submitted && errors.justification" class="text-red-500">{{ errors.justification }}</small>
            </div>

            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text @click="visible = false" />
            <Button type="submit" form="assign-form" :label="currentUuid ? 'Trocar' : 'Atribuir'" icon="pi pi-check" :loading="saving" />
        </template>
    </Dialog>
</template>
