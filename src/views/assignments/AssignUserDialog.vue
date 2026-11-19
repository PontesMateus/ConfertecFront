<script setup>
import { ASSIGNMENT_ROLE } from '@/constants/pickingBatchAssignmentRole';
import { PickingBatchService } from '@/service/PickingBatchService';
import { computed, ref, watch } from 'vue';

const JUSTIFICATION_MAX_LENGTH = 1000;

const props = defineProps({
    batch: { type: Object, default: null },
    /** ASSIGNMENT_ROLE id */
    role: { type: Number, required: true },
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

const isPicker = computed(() => props.role === ASSIGNMENT_ROLE.PICKER);
const currentUuid = computed(() => (isPicker.value ? props.batch?.userUuid : props.batch?.checker?.uuid));
const header = computed(() => {
    if (isPicker.value) return 'Trocar separador';
    return props.batch?.checker ? 'Trocar conferente' : 'Atribuir conferente';
});

/**
 * Whoever has the other role now, offered for a swap: only with both roles filled and before the picking starts,
 * while neither has worked on the batch.
 */
const swapUuid = computed(() => {
    if (!props.batch?.checker || props.batch.started) return null;
    return isPicker.value ? props.batch.checker.uuid : props.batch.userUuid;
});
const swapping = computed(() => Boolean(userUuid.value) && userUuid.value === swapUuid.value);

/**
 * A former picker can check while the picking has not started: nobody has picked anything yet (the API allows it too)
 */
const formerPickerCanCheck = computed(() => !isPicker.value && !props.batch?.started);

/**
 * The check is blind: anyone ever assigned to the other role of this batch is left out (the API refuses them too),
 * except former pickers before the picking starts; whoever has this role now is left out too. The swap candidate
 * is the exception; without one, the current picker is never the checker.
 */
const options = computed(() => {
    const otherRole = isPicker.value ? ASSIGNMENT_ROLE.CHECKER : ASSIGNMENT_ROLE.PICKER;
    const blocked = new Set(formerPickerCanCheck.value ? [] : (props.batch?.assignments ?? []).filter((assignment) => assignment.roleId === otherRole).map((assignment) => assignment.userUuid));
    if (!isPicker.value && !swapUuid.value) blocked.add(props.batch?.userUuid);
    return props.users.filter((user) => user.uuid !== currentUuid.value && (user.uuid === swapUuid.value || !blocked.has(user.uuid))).map((user) => (user.uuid === swapUuid.value ? { ...user, name: `${user.name} (trocar de função)` } : user));
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
        emit('saved', saved, { swapped: swapping.value });
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
                <small v-else class="text-muted-color">
                    <template v-if="formerPickerCanCheck">O separador atual não pode conferir: a conferência é cega. Quem deixou de ser separador antes de a separação começar pode conferir.</template>
                    <template v-else>Quem já {{ isPicker ? 'foi conferente' : 'foi separador' }} deste grupo não aparece: a conferência é cega.</template>
                    <template v-if="swapUuid"> Até a separação começar, dá para trocar as funções do separador e do conferente.</template>
                </small>
            </div>

            <Message v-if="swapping" severity="info" size="small">
                {{ isPicker ? `${batch.checker.name} passa a separar e ${batch.userName} passa a conferir.` : `${batch.userName} passa a conferir e ${batch.checker.name} passa a separar.` }}
            </Message>

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
