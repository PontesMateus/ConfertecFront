<script setup>
import { MaterialService } from '@/service/MaterialService';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import MaterialFormDialog from './MaterialFormDialog.vue';

const toast = useToast();
const confirm = useConfirm();

const materials = ref([]);
const loading = ref(true);
const loadError = ref('');

const search = ref('');
const statusFilter = ref('current');
const statusOptions = [
    { label: 'Ativos', value: 'current' },
    { label: 'Obsoletos', value: 'obsolete' },
    { label: 'Todos', value: 'all' }
];

const formVisible = ref(false);
const selectedMaterial = ref(null);

const filteredMaterials = computed(() => {
    const term = normalize(search.value.trim());
    return materials.value.filter((material) => {
        if (statusFilter.value === 'current' && material.obsolete) return false;
        if (statusFilter.value === 'obsolete' && !material.obsolete) return false;
        if (!term) return true;
        return normalize(material.code).includes(term) || normalize(material.description).includes(term);
    });
});

/** Case- and accent-insensitive comparison, so "metalica" finds "metálica". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        materials.value = await MaterialService.list();
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

function replaceMaterial(saved) {
    const index = materials.value.findIndex((material) => material.uuid === saved.uuid);
    if (index === -1) {
        materials.value = [...materials.value, saved].sort((a, b) => a.code.localeCompare(b.code, 'pt-BR'));
    } else {
        materials.value.splice(index, 1, saved);
    }
}

function openCreate() {
    selectedMaterial.value = null;
    formVisible.value = true;
}

function openEdit(material) {
    selectedMaterial.value = material;
    formVisible.value = true;
}

function onSaved(saved, wasEdit) {
    replaceMaterial(saved);
    toast.add({ severity: 'success', summary: wasEdit ? 'Material atualizado' : 'Material criado', detail: saved.code, life: 3000 });
}

function confirmSetObsolete(material, obsolete) {
    confirm.require({
        header: obsolete ? 'Marcar como obsoleto' : 'Reativar material',
        message: obsolete ? `${material.code} deixará de aparecer para novos usos, mas continua nas remessas em que já foi usado. Deseja continuar?` : `${material.code} voltará a ficar disponível para uso. Deseja continuar?`,
        icon: obsolete ? 'pi pi-history' : 'pi pi-replay',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: obsolete ? { label: 'Marcar como obsoleto', severity: 'warn' } : { label: 'Reativar' },
        accept: () => setObsolete(material, obsolete)
    });
}

async function setObsolete(material, obsolete) {
    try {
        replaceMaterial(await MaterialService.setObsolete(material.uuid, obsolete));
        toast.add({ severity: 'success', summary: obsolete ? 'Material marcado como obsoleto' : 'Material reativado', detail: material.code, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível alterar a situação', detail: error.message, life: 5000 });
    }
}

function confirmDelete(material) {
    confirm.require({
        header: 'Excluir material',
        message: `${material.code} será excluído definitivamente. Deseja continuar?`,
        icon: 'pi pi-trash',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Excluir', severity: 'danger' },
        accept: () => deleteMaterial(material)
    });
}

async function deleteMaterial(material) {
    try {
        await MaterialService.delete(material.uuid);
        materials.value = materials.value.filter((item) => item.uuid !== material.uuid);
        toast.add({ severity: 'success', summary: 'Material excluído', detail: material.code, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível excluir', detail: error.message, life: 5000 });
        // It may have been added to a shipment meanwhile: refresh its "used" flag
        load();
    }
}

onMounted(load);
</script>

<template>
    <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
                <h1 class="text-2xl font-semibold m-0">Materiais</h1>
                <p class="text-muted-color m-0 mt-1">Materiais usados nas remessas. Os que já estão em remessa não podem ser excluídos, apenas marcados como obsoletos.</p>
            </div>
            <Button label="Novo material" icon="pi pi-plus" :disabled="loading || !!loadError" @click="openCreate" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
            </div>
        </Message>

        <DataTable :value="filteredMaterials" :loading="loading" dataKey="uuid" paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows>
            <template #header>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <SelectButton v-model="statusFilter" :options="statusOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
                    <IconField class="w-full sm:w-80">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por código ou descrição" fluid />
                    </IconField>
                </div>
            </template>

            <template #empty>
                <div class="py-6 text-center text-muted-color">Nenhum material encontrado.</div>
            </template>

            <Column field="code" header="Código" sortable class="whitespace-nowrap">
                <template #body="{ data }">
                    <span class="font-medium">{{ data.code }}</span>
                </template>
            </Column>
            <Column field="description" header="Descrição" sortable />
            <Column field="used" header="Em remessa" sortable class="whitespace-nowrap">
                <template #body="{ data }">
                    <span v-if="data.used"><i class="pi pi-check text-brand mr-1"></i>Sim</span>
                    <span v-else class="text-muted-color">Não</span>
                </template>
            </Column>
            <Column field="obsolete" header="Situação" sortable>
                <template #body="{ data }">
                    <Tag :value="data.obsolete ? 'Obsoleto' : 'Ativo'" :severity="data.obsolete ? 'warn' : 'success'" />
                </template>
            </Column>
            <Column header="Ações" class="w-0 whitespace-nowrap">
                <template #body="{ data }">
                    <div class="flex gap-1 justify-end">
                        <Button icon="pi pi-pencil" severity="secondary" text rounded aria-label="Editar" v-tooltip.top="'Editar'" @click="openEdit(data)" />
                        <Button v-if="data.obsolete" icon="pi pi-replay" severity="success" text rounded aria-label="Reativar" v-tooltip.top="'Reativar'" @click="confirmSetObsolete(data, false)" />
                        <Button v-else-if="data.used" icon="pi pi-history" severity="warn" text rounded aria-label="Marcar como obsoleto" v-tooltip.top="'Marcar como obsoleto'" @click="confirmSetObsolete(data, true)" />
                        <Button v-else icon="pi pi-trash" severity="danger" text rounded aria-label="Excluir" v-tooltip.top="'Excluir'" @click="confirmDelete(data)" />
                    </div>
                </template>
            </Column>
        </DataTable>
    </div>

    <MaterialFormDialog v-model:visible="formVisible" :material="selectedMaterial" @saved="onSaved" />
</template>
