<script setup>
import { UserService } from '@/service/UserService';
import { session } from '@/service/session';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import UserFormDialog from './UserFormDialog.vue';
import UserPasswordDialog from './UserPasswordDialog.vue';

const toast = useToast();
const confirm = useConfirm();

const users = ref([]);
const userTypes = ref([]);
const loading = ref(true);
const loadError = ref('');

const search = ref('');
const statusFilter = ref('active');
const statusOptions = [
    { label: 'Ativos', value: 'active' },
    { label: 'Inativos', value: 'inactive' },
    { label: 'Todos', value: 'all' }
];

const formVisible = ref(false);
const passwordVisible = ref(false);
const selectedUser = ref(null);

const currentUserUuid = computed(() => session.state.user?.uuid);

const filteredUsers = computed(() => {
    const term = normalize(search.value.trim());
    return users.value.filter((user) => {
        if (statusFilter.value === 'active' && !user.active) return false;
        if (statusFilter.value === 'inactive' && user.active) return false;
        if (!term) return true;
        return [user.name, user.login, user.email, user.userType].some((value) => value && normalize(value).includes(term));
    });
});

/** Case- and accent-insensitive comparison, so "joao" finds "João". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        [users.value, userTypes.value] = await Promise.all([UserService.list(), UserService.listUserTypes()]);
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

function replaceUser(saved) {
    const index = users.value.findIndex((user) => user.uuid === saved.uuid);
    if (index === -1) {
        users.value = [...users.value, saved].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } else {
        users.value.splice(index, 1, saved);
    }
}

function openCreate() {
    selectedUser.value = null;
    formVisible.value = true;
}

function openEdit(user) {
    selectedUser.value = user;
    formVisible.value = true;
}

function openPasswordReset(user) {
    selectedUser.value = user;
    passwordVisible.value = true;
}

function onSaved(saved, wasEdit) {
    replaceUser(saved);
    if (saved.uuid === currentUserUuid.value) session.setUser(saved);
    toast.add({ severity: 'success', summary: wasEdit ? 'Usuário atualizado' : 'Usuário criado', detail: saved.name, life: 3000 });
}

function onPasswordReset(user) {
    toast.add({ severity: 'success', summary: 'Senha redefinida', detail: user.name, life: 3000 });
}

function confirmToggleActive(user) {
    const deactivate = user.active;
    confirm.require({
        header: deactivate ? 'Desativar usuário' : 'Reativar usuário',
        message: deactivate ? `${user.name} não poderá mais entrar no sistema e as sessões abertas serão encerradas. Deseja continuar?` : `${user.name} poderá entrar no sistema novamente. Deseja continuar?`,
        icon: deactivate ? 'pi pi-ban' : 'pi pi-check-circle',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: deactivate ? { label: 'Desativar', severity: 'danger' } : { label: 'Reativar' },
        accept: () => toggleActive(user, !deactivate)
    });
}

async function toggleActive(user, active) {
    try {
        replaceUser(await UserService.setActive(user.uuid, active));
        toast.add({ severity: 'success', summary: active ? 'Usuário reativado' : 'Usuário desativado', detail: user.name, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível alterar a situação', detail: error.message, life: 5000 });
    }
}

onMounted(load);
</script>

<template>
    <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
                <h1 class="text-2xl font-semibold m-0">Usuários</h1>
                <p class="text-muted-color m-0 mt-1">Cadastro e acesso de quem usa o Confertec.</p>
            </div>
            <Button label="Novo usuário" icon="pi pi-plus" :disabled="loading || !!loadError" @click="openCreate" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
            </div>
        </Message>

        <DataTable :value="filteredUsers" :loading="loading" dataKey="uuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
            <template #header>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <SelectButton v-model="statusFilter" :options="statusOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
                    <IconField class="w-full sm:w-80">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por nome, login, email ou tipo" fluid />
                    </IconField>
                </div>
            </template>

            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhum usuário encontrado.</div>
            </template>

            <Column field="name" header="Nome" sortable>
                <template #body="{ data }">
                    <span class="font-medium">{{ data.name }}</span>
                    <Tag v-if="data.uuid === currentUserUuid" value="Você" severity="secondary" class="ml-2" />
                </template>
            </Column>
            <Column field="login" header="Login" sortable />
            <Column field="email" header="Email" sortable>
                <template #body="{ data }">
                    <span v-if="data.email">{{ data.email }}</span>
                    <span v-else class="text-muted-color">—</span>
                </template>
            </Column>
            <Column field="userType" header="Tipo" sortable />
            <Column field="active" header="Situação" sortable>
                <template #body="{ data }">
                    <Tag :value="data.active ? 'Ativo' : 'Inativo'" :severity="data.active ? 'success' : 'danger'" />
                </template>
            </Column>
            <Column header="Ações" class="w-0 whitespace-nowrap">
                <template #body="{ data }">
                    <div class="flex gap-1 justify-end">
                        <Button icon="pi pi-pencil" severity="secondary" text rounded aria-label="Editar" v-tooltip.top="'Editar'" @click="openEdit(data)" />
                        <Button icon="pi pi-key" severity="secondary" text rounded aria-label="Redefinir senha" v-tooltip.top="'Redefinir senha'" @click="openPasswordReset(data)" />
                        <span v-tooltip.top="data.uuid === currentUserUuid ? 'Não é possível desativar a própria conta' : data.active ? 'Desativar' : 'Reativar'">
                            <Button
                                :icon="data.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                                :severity="data.active ? 'danger' : 'success'"
                                text
                                rounded
                                :aria-label="data.active ? 'Desativar' : 'Reativar'"
                                :disabled="data.uuid === currentUserUuid"
                                @click="confirmToggleActive(data)"
                            />
                        </span>
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>

    <UserFormDialog v-model:visible="formVisible" :user="selectedUser" :userTypes="userTypes" @saved="onSaved" />
    <UserPasswordDialog v-model:visible="passwordVisible" :user="selectedUser" @saved="onPasswordReset" />
</template>
