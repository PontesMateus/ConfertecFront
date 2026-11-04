<script setup>
import { UserService } from '@/service/UserService';
import { computed, ref, watch } from 'vue';

const PASSWORD_MIN_LENGTH = 8;

const props = defineProps({
    user: { type: Object, default: null }
});
const emit = defineEmits(['saved']);
const visible = defineModel('visible', { type: Boolean, default: false });

const password = ref('');
const confirmation = ref('');
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

watch(visible, (open) => {
    if (!open) return;
    password.value = '';
    confirmation.value = '';
    submitted.value = false;
    errorMessage.value = '';
});

const errors = computed(() => ({
    password: password.value.length < PASSWORD_MIN_LENGTH && `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
    confirmation: confirmation.value !== password.value && 'As senhas não conferem'
}));

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (errors.value.password || errors.value.confirmation) return;

    saving.value = true;
    try {
        await UserService.resetPassword(props.user.uuid, password.value);
        emit('saved', props.user);
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Redefinir senha" modal :style="{ width: '28rem' }" :breakpoints="{ '575px': '95vw' }">
        <p v-if="user" class="mt-0 mb-5 text-muted-color">
            Nova senha para <span class="font-medium text-color">{{ user.name }}</span> ({{ user.login }}). As sessões abertas desse usuário serão encerradas.
        </p>

        <form id="password-form" class="flex flex-col gap-4" @submit.prevent="save">
            <div class="flex flex-col gap-2">
                <label for="new-password" class="font-medium">Nova senha</label>
                <Password inputId="new-password" v-model="password" :feedback="false" toggleMask :invalid="submitted && !!errors.password" :inputProps="{ autocomplete: 'new-password' }" autofocus fluid />
                <small v-if="submitted && errors.password" class="text-red-500">{{ errors.password }}</small>
                <small v-else class="text-muted-color">Mínimo de {{ PASSWORD_MIN_LENGTH }} caracteres.</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="confirm-password" class="font-medium">Confirmar senha</label>
                <Password inputId="confirm-password" v-model="confirmation" :feedback="false" toggleMask :invalid="submitted && !!errors.confirmation" :inputProps="{ autocomplete: 'new-password' }" fluid />
                <small v-if="submitted && errors.confirmation" class="text-red-500">{{ errors.confirmation }}</small>
            </div>

            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text @click="visible = false" />
            <Button type="submit" form="password-form" label="Redefinir senha" icon="pi pi-key" :loading="saving" />
        </template>
    </Dialog>
</template>
