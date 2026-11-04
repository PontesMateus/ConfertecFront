<script setup>
import { UserService } from '@/service/UserService';
import { session } from '@/service/session';
import { computed, reactive, ref, watch } from 'vue';

const PASSWORD_MIN_LENGTH = 8;

const props = defineProps({
    /** User being edited; null to create a new one */
    user: { type: Object, default: null },
    userTypes: { type: Array, required: true }
});
const emit = defineEmits(['saved']);
const visible = defineModel('visible', { type: Boolean, default: false });

const form = reactive({ login: '', name: '', email: '', userTypeUuid: null, password: '' });
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const isEdit = computed(() => Boolean(props.user));
const isSelf = computed(() => isEdit.value && props.user.uuid === session.state.user?.uuid);

watch(visible, (open) => {
    if (!open) return;
    Object.assign(form, {
        login: props.user?.login ?? '',
        name: props.user?.name ?? '',
        email: props.user?.email ?? '',
        userTypeUuid: props.user?.userTypeUuid ?? null,
        password: ''
    });
    submitted.value = false;
    errorMessage.value = '';
});

const errors = computed(() => ({
    login: !form.login.trim() && 'Informe o login',
    name: !form.name.trim() && 'Informe o nome',
    email: form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && 'Email inválido',
    userTypeUuid: !form.userTypeUuid && 'Selecione o tipo',
    password: !isEdit.value && form.password.length < PASSWORD_MIN_LENGTH && `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres`
}));
const hasErrors = computed(() => Object.values(errors.value).some(Boolean));

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (hasErrors.value) return;

    const payload = {
        login: form.login.trim(),
        name: form.name.trim(),
        email: form.email.trim() || null,
        userTypeUuid: form.userTypeUuid
    };

    saving.value = true;
    try {
        const saved = isEdit.value ? await UserService.update(props.user.uuid, payload) : await UserService.create({ ...payload, password: form.password });
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
    <Dialog v-model:visible="visible" :header="isEdit ? 'Editar usuário' : 'Novo usuário'" modal :style="{ width: '32rem' }" :breakpoints="{ '575px': '95vw' }">
        <form id="user-form" class="flex flex-col gap-4" @submit.prevent="save">
            <div class="flex flex-col gap-2">
                <label for="user-name" class="font-medium">Nome</label>
                <InputText id="user-name" v-model="form.name" :invalid="submitted && !!errors.name" autofocus fluid />
                <small v-if="submitted && errors.name" class="text-red-500">{{ errors.name }}</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="user-login" class="font-medium">Login</label>
                <InputText id="user-login" v-model="form.login" :invalid="submitted && !!errors.login" autocomplete="off" fluid />
                <small v-if="submitted && errors.login" class="text-red-500">{{ errors.login }}</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="user-email" class="font-medium">Email <span class="text-muted-color font-normal">(opcional)</span></label>
                <InputText id="user-email" v-model="form.email" type="email" :invalid="submitted && !!errors.email" autocomplete="off" fluid />
                <small v-if="submitted && errors.email" class="text-red-500">{{ errors.email }}</small>
            </div>

            <div class="flex flex-col gap-2">
                <label for="user-type" class="font-medium">Tipo</label>
                <Select inputId="user-type" v-model="form.userTypeUuid" :options="userTypes" optionLabel="description" optionValue="uuid" placeholder="Selecione" :disabled="isSelf" :invalid="submitted && !!errors.userTypeUuid" fluid />
                <small v-if="isSelf" class="text-muted-color">Não é possível alterar o próprio tipo de usuário.</small>
                <small v-else-if="submitted && errors.userTypeUuid" class="text-red-500">{{ errors.userTypeUuid }}</small>
            </div>

            <div v-if="!isEdit" class="flex flex-col gap-2">
                <label for="user-password" class="font-medium">Senha</label>
                <Password inputId="user-password" v-model="form.password" :feedback="false" toggleMask :invalid="submitted && !!errors.password" :inputProps="{ autocomplete: 'new-password' }" fluid />
                <small v-if="submitted && errors.password" class="text-red-500">{{ errors.password }}</small>
                <small v-else class="text-muted-color">Mínimo de {{ PASSWORD_MIN_LENGTH }} caracteres.</small>
            </div>

            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text @click="visible = false" />
            <Button type="submit" form="user-form" :label="isEdit ? 'Salvar' : 'Criar usuário'" icon="pi pi-check" :loading="saving" />
        </template>
    </Dialog>
</template>
