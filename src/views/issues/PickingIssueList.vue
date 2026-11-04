<script setup>
import { PickingIssueService } from '@/service/PickingIssueService';
import { formatDateTime } from '@/utils/date';
import { useToast } from 'primevue/usetoast';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ResolveIssueDialog from './ResolveIssueDialog.vue';

const props = defineProps({
    /**
     * Set on the shipment page: every issue of that shipment, resolved ones included.
     * Unset (home page): only open issues, of every shipment.
     */
    shipmentUuid: { type: String, default: null }
});
/** After a resolution, which may have created a revision of the shipment */
const emit = defineEmits(['resolved']);

const router = useRouter();
const toast = useToast();

const issues = ref([]);
const loading = ref(true);
const loadError = ref('');
const search = ref('');

const resolveVisible = ref(false);
const selectedIssue = ref(null);

const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const forShipment = computed(() => Boolean(props.shipmentUuid));
const openCount = computed(() => issues.value.filter((issue) => issue.open).length);

const filteredIssues = computed(() => {
    const term = normalize(search.value.trim());
    if (!term) return issues.value;
    return issues.value.filter((issue) => [shipmentLabel(issue), issue.materialCode, issue.materialDescription, issue.shipment.customer, issue.picking.userName].some((value) => value && normalize(value).includes(term)));
});

/** Open issues of the selected issue's shipment: a new revision resolves them all */
const openIssueCountInShipment = computed(() => issues.value.filter((issue) => issue.open && issue.shipment.uuid === selectedIssue.value?.shipment.uuid).length || 1);

/** Case- and accent-insensitive comparison, so "construcao" finds "Construção". */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function shipmentLabel(issue) {
    return `${issue.shipment.record}-${issue.shipment.recordReceipt}`;
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        issues.value = await PickingIssueService.list(forShipment.value ? { shipmentUuid: props.shipmentUuid } : { open: true });
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

function openResolve(issue) {
    selectedIssue.value = issue;
    resolveVisible.value = true;
}

function onResolved({ issue: resolved, resolvedIssueCount, revisionNumber }) {
    let detail = `${resolved.materialCode}: aguardando reposição`;
    if (revisionNumber) {
        detail = `Revisão ${revisionNumber} criada na remessa ${shipmentLabel(resolved)}`;
        if (resolvedIssueCount > 1) detail += `; ${resolvedIssueCount} faltas resolvidas`;
    }
    toast.add({ severity: 'success', summary: resolvedIssueCount > 1 ? 'Faltas resolvidas' : 'Falta resolvida', detail, life: 5000 });
    // A new revision resolves every open issue of the shipment, so read them again
    load();
    emit('resolved', { issue: resolved, resolvedIssueCount, revisionNumber });
}

watch(() => props.shipmentUuid, load, { immediate: true });
</script>

<template>
    <div class="card" :class="{ 'mb-0': forShipment }">
        <div class="flex flex-wrap items-center justify-between gap-4" :class="forShipment ? 'mb-4' : 'mb-6'">
            <div v-if="forShipment">
                <h2 class="text-xl font-semibold m-0">
                    Faltas na separação
                    <Tag v-if="openCount" :value="openCount === 1 ? '1 aberta' : `${openCount} abertas`" severity="warn" class="ml-2 align-middle" />
                </h2>
            </div>
            <div v-else>
                <h1 class="text-2xl font-semibold m-0">Faltas aguardando resolução</h1>
                <p class="text-muted-color m-0 mt-1">Faltas informadas pelos separadores. A separação só pode ser concluída depois que suas faltas forem resolvidas.</p>
            </div>
            <Button label="Atualizar" icon="pi pi-refresh" severity="secondary" outlined :size="forShipment ? 'small' : undefined" :loading="loading" @click="load" />
        </div>

        <Message v-if="loadError" severity="error" class="mb-4">
            <div class="flex flex-wrap items-center gap-3">
                <span>{{ loadError }}</span>
                <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
            </div>
        </Message>

        <DataTable :value="filteredIssues" :loading="loading" dataKey="uuid" :paginator="!forShipment" :rows="20" :rowsPerPageOptions="[20, 50, 100]" stripedRows :size="forShipment ? 'small' : undefined">
            <template v-if="!forShipment" #header>
                <div class="flex justify-end">
                    <IconField class="w-full sm:w-80">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="search" placeholder="Buscar por remessa, material, cliente ou separador" fluid />
                    </IconField>
                </div>
            </template>

            <template #empty>
                <div class="py-6 text-center text-muted-color">{{ forShipment ? 'Nenhuma falta informada nesta remessa.' : 'Nenhuma falta aguardando resolução.' }}</div>
            </template>

            <Column v-if="!forShipment" header="Remessa" class="whitespace-nowrap">
                <template #body="{ data }">
                    <Button :label="shipmentLabel(data)" link class="p-0 font-medium" @click="router.push({ name: 'shipment', params: { shipmentUuid: data.shipment.uuid } })" />
                    <div class="text-xs text-muted-color">{{ data.shipment.customer ?? '—' }}</div>
                </template>
            </Column>
            <Column field="materialCode" header="Material" sortable>
                <template #body="{ data }">
                    <div class="font-medium">{{ data.materialCode }}</div>
                    <div class="text-xs text-muted-color">{{ data.materialDescription }}</div>
                </template>
            </Column>
            <Column field="type" header="Motivo" sortable class="whitespace-nowrap" />
            <Column field="qty" header="Falta" class="text-right whitespace-nowrap">
                <template #body="{ data }">
                    <span class="font-medium">{{ data.qty === null ? '—' : qtyFormat.format(data.qty) }}</span>
                </template>
            </Column>
            <Column header="Observação">
                <template #body="{ data }">{{ data.description || '—' }}</template>
            </Column>
            <Column header="Separador" class="whitespace-nowrap">
                <template #body="{ data }">
                    <div>{{ data.picking.userName }}</div>
                    <div class="text-xs text-muted-color">{{ formatDateTime(data.createdAt) }}</div>
                </template>
            </Column>
            <Column v-if="forShipment" header="Situação">
                <template #body="{ data }">
                    <Tag v-if="data.open" value="Aberta" severity="warn" />
                    <div v-else class="flex flex-col gap-1">
                        <Tag :value="data.resolution.type" :severity="data.resolution.revisionUuid ? 'info' : 'secondary'" class="self-start" />
                        <span class="text-xs text-muted-color">{{ data.resolution.userName }} · {{ formatDateTime(data.resolution.createdAt) }}</span>
                        <span v-if="data.resolution.note" class="text-xs">{{ data.resolution.note }}</span>
                    </div>
                </template>
            </Column>
            <Column header="" class="w-0 whitespace-nowrap">
                <template #body="{ data }">
                    <Button v-if="data.open" label="Resolver" icon="pi pi-check" size="small" :disabled="data.picking.status !== 'Em andamento'" @click="openResolve(data)" />
                </template>
            </Column>
        </DataTable>
    </div>

    <ResolveIssueDialog v-model:visible="resolveVisible" :issue="selectedIssue" :openIssueCount="openIssueCountInShipment" @resolved="onResolved" />
</template>
