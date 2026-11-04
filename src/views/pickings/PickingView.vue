<script setup>
import { PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
import { PickingService } from '@/service/PickingService';
import { session } from '@/service/session';
import { formatDateTime } from '@/utils/date';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PickingIssueDialog from './PickingIssueDialog.vue';

// Waits for the picker to stop typing before saving a quantity
const SAVE_DELAY_MS = 600;
// While a shortage waits for the administrator, checks for its resolution this often
const REFRESH_INTERVAL_MS = 30_000;

const props = defineProps({
    pickingUuid: { type: String, required: true }
});

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const picking = ref(null);
/** Items with local edit state: draftQty (shown); pickedQty, missingQty, remainingQty, accounted (saved); saveState */
const items = ref([]);
const loading = ref(true);
const loadError = ref('');
const itemFilter = ref('all');
const itemFilterOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Pendentes', value: 'pending' }
];

const finishVisible = ref(false);
const finishing = ref(false);
const finishError = ref('');
const finishForm = reactive({ customerInspection: false, companyPersonQty: 1, customerPersonQty: 0 });

const issueVisible = ref(false);
const issueItem = ref(null);
const withdrawingUuid = ref(null);
const returningUuid = ref(null);

const timers = new Map();
const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const shipment = computed(() => picking.value?.shipment);
const label = computed(() => shipment.value && `${shipment.value.record}-${shipment.value.recordReceipt}`);
const editable = computed(() => picking.value?.status === 'Em andamento' && picking.value.userUuid === session.state.user?.uuid);
const doneCount = computed(() => items.value.filter((item) => item.done).length);
const progress = computed(() => (items.value.length ? Math.round((doneCount.value / items.value.length) * 100) : 0));
const pendingSaves = computed(() => items.value.some((item) => item.saveState === 'pending' || item.saveState === 'saving'));
// An open issue waits for the administrator's resolution: until then the picking cannot be finished
/** Picked materials a new revision took out of the shipment: they go back before finishing */
const removedItems = computed(() => picking.value?.removedItems ?? []);
const overCount = computed(() => items.value.filter((item) => item.overQty > 0).length);
const canFinish = computed(() => editable.value && items.value.length > 0 && doneCount.value === items.value.length && !openIssues.value.length && !removedItems.value.length && !pendingSaves.value);
const finishHint = computed(() => {
    if (openIssues.value.length) return 'Há faltas aguardando resolução do administrador';
    if (removedItems.value.length || overCount.value) return 'Devolva os materiais em excesso para concluir';
    return 'Separe todos os itens por completo para concluir';
});
// "Accounted": nothing left for the picker to do (picked in full, or the rest reported missing)
const visibleItems = computed(() => (itemFilter.value === 'pending' ? items.value.filter((item) => !item.accounted || item.overQty > 0 || item.saveState !== 'saved') : items.value));
const openIssues = computed(() => picking.value?.issues.filter((issue) => issue.open) ?? []);
const itemsWithShortage = computed(() => items.value.filter((item) => item.missingQty > 0).length);

function toLocalItem(item) {
    return { ...item, draftQty: item.pickedQty, saveState: 'saved', errorMessage: '', seq: 0 };
}

/** Max the picker can type: the shipment quantity minus what is reported missing */
function pickableQty(item) {
    return Math.round((item.requiredQty - item.missingQty) * 1000) / 1000;
}

/** Replaces the whole picking; only called with no save pending, so no typed quantity is lost */
function applyPicking(value) {
    picking.value = value;
    items.value = value.items.map(toLocalItem);
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        applyPicking(await PickingService.get(props.pickingUuid));
        document.title = `Separação ${label.value} | Confertec`;
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

/** Reloads when it is safe (no quantity being saved, no dialog open) and tells which shortages were resolved. */
async function refresh() {
    if (pendingSaves.value || issueVisible.value || finishVisible.value || loading.value) return;
    const wasOpen = new Set(openIssues.value.map((issue) => issue.uuid));
    try {
        applyPicking(await PickingService.get(props.pickingUuid));
    } catch {
        return; // Keeps the current screen; the next tick or the button tries again
    }
    for (const issue of picking.value.issues.filter((candidate) => wasOpen.has(candidate.uuid) && candidate.resolution)) {
        const detail = issue.resolution.revisionUuid ? `${issue.materialCode}: substituído, confira os itens` : `${issue.materialCode}: aguardar reposição`;
        toast.add({ severity: 'info', summary: 'Falta resolvida pelo administrador', detail, life: 8000 });
    }
}

let refreshTimer = null;
onMounted(() => {
    refreshTimer = setInterval(() => {
        if (editable.value && openIssues.value.length) refresh();
    }, REFRESH_INTERVAL_MS);
});

function onQtyInput(item, value) {
    item.draftQty = value ?? 0;
    item.saveState = 'pending';
    item.errorMessage = '';
    clearTimeout(timers.get(item.lineUuid));
    timers.set(
        item.lineUuid,
        setTimeout(() => save(item), SAVE_DELAY_MS)
    );
}

function fillItem(item) {
    item.draftQty = pickableQty(item);
    clearTimeout(timers.get(item.lineUuid));
    save(item);
}

async function save(item) {
    timers.delete(item.lineUuid);
    // Only the latest request of a line may update it, if the picker typed again meanwhile
    const seq = ++item.seq;
    item.saveState = 'saving';
    try {
        const saved = await PickingService.setItemQty(props.pickingUuid, item.lineUuid, item.draftQty);
        if (seq !== item.seq) return;
        Object.assign(item, { pickedQty: saved.pickedQty, done: saved.done, missingQty: saved.missingQty, remainingQty: saved.remainingQty, accounted: saved.accounted, overQty: saved.overQty, saveState: 'saved' });
    } catch (error) {
        if (seq !== item.seq) return;
        // Back to the last saved value, so the screen never shows a quantity the server does not have
        Object.assign(item, { draftQty: item.pickedQty, saveState: 'error', errorMessage: error.message });
    }
}

function flushPendingSaves() {
    for (const [lineUuid, timer] of timers) {
        clearTimeout(timer);
        const item = items.value.find((candidate) => candidate.lineUuid === lineUuid);
        if (item) save(item);
    }
}

async function markReturned(item) {
    returningUuid.value = item.lineUuid;
    try {
        await PickingService.setItemQty(props.pickingUuid, item.lineUuid, 0);
        picking.value.removedItems = picking.value.removedItems.filter((removed) => removed.lineUuid !== item.lineUuid);
        toast.add({ severity: 'success', summary: 'Material devolvido', detail: item.materialCode, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível registrar', detail: error.message, life: 5000 });
    } finally {
        returningUuid.value = null;
    }
}

function openIssue(item) {
    issueItem.value = item;
    issueVisible.value = true;
}

function onIssueReported(value, item) {
    applyPicking(value);
    toast.add({ severity: 'warn', summary: 'Falta informada', detail: item.materialCode, life: 3000 });
}

function confirmWithdraw(issue) {
    confirm.require({
        header: 'Retirar falta',
        message: `A falta de ${qtyFormat.format(issue.qty)} em ${issue.materialCode} será retirada e o item voltará a ficar pendente. Deseja continuar?`,
        icon: 'pi pi-undo',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Retirar falta', severity: 'warn' },
        accept: () => withdraw(issue)
    });
}

async function withdraw(issue) {
    withdrawingUuid.value = issue.uuid;
    try {
        applyPicking(await PickingService.withdrawIssue(props.pickingUuid, issue.uuid));
        toast.add({ severity: 'success', summary: 'Falta retirada', detail: issue.materialCode, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível retirar', detail: error.message, life: 5000 });
    } finally {
        withdrawingUuid.value = null;
    }
}

function openFinish() {
    finishForm.customerInspection = picking.value.customerInspection;
    finishForm.companyPersonQty = picking.value.companyPersonQty;
    finishForm.customerPersonQty = picking.value.customerPersonQty;
    finishError.value = '';
    finishVisible.value = true;
}

async function finish() {
    finishing.value = true;
    finishError.value = '';
    try {
        await PickingService.finish(props.pickingUuid, {
            customerInspection: finishForm.customerInspection,
            companyPersonQty: finishForm.companyPersonQty ?? 1,
            customerPersonQty: finishForm.customerPersonQty ?? 0
        });
        finishVisible.value = false;
        toast.add({ severity: 'success', summary: 'Separação concluída', detail: `Remessa ${label.value}`, life: 4000 });
        router.push({ name: 'home' });
    } catch (error) {
        finishError.value = error.message;
    } finally {
        finishing.value = false;
    }
}

watch(() => props.pickingUuid, load, { immediate: true });
onBeforeUnmount(() => {
    clearInterval(refreshTimer);
    flushPendingSaves();
});
</script>

<template>
    <div class="flex flex-col gap-6">
        <div class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <Button icon="pi pi-arrow-left" severity="secondary" text rounded aria-label="Voltar" v-tooltip.bottom="'Voltar para a lista'" @click="router.push({ name: 'home' })" />
                    <div>
                        <h1 class="text-2xl font-semibold m-0">
                            Separação <span v-if="label">{{ label }}</span>
                        </h1>
                        <div v-if="picking" class="flex flex-wrap items-center gap-2 mt-1 text-muted-color">
                            <Tag :value="picking.status" :severity="PICKING_STATUS_SEVERITY[picking.status]" />
                            <span>Responsável: {{ picking.userName }}</span>
                            <span>·</span>
                            <span>Iniciada em {{ formatDateTime(picking.createdAt) }}</span>
                            <span>·</span>
                            <span>Revisão {{ shipment.revisionNumber }}</span>
                        </div>
                    </div>
                </div>
                <div v-if="picking" class="flex gap-2">
                    <Button icon="pi pi-refresh" severity="secondary" outlined aria-label="Atualizar" v-tooltip.bottom="'Atualizar'" :disabled="pendingSaves" @click="refresh" />
                    <Button v-if="editable" label="Concluir separação" icon="pi pi-check" :disabled="!canFinish" v-tooltip.bottom="canFinish ? null : finishHint" @click="openFinish" />
                </div>
            </div>

            <Message v-if="loadError" severity="error" class="mt-4">
                <div class="flex flex-wrap items-center gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
                </div>
            </Message>

            <div v-if="loading && !picking" class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <Skeleton v-for="n in 4" :key="n" height="2.75rem" />
            </div>

            <template v-else-if="picking">
                <dl class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 mt-6 mb-0">
                    <div>
                        <dt class="text-sm text-muted-color">Saída</dt>
                        <dd class="m-0 mt-1 font-medium">{{ formatDateTime(shipment.shippingAt) }}</dd>
                    </div>
                    <div>
                        <dt class="text-sm text-muted-color">Cliente</dt>
                        <dd class="m-0 mt-1 font-medium">{{ shipment.customer || '—' }}</dd>
                    </div>
                    <div>
                        <dt class="text-sm text-muted-color">Obra</dt>
                        <dd class="m-0 mt-1 font-medium">{{ shipment.venture || '—' }}</dd>
                    </div>
                    <div>
                        <dt class="text-sm text-muted-color">Veículo</dt>
                        <dd class="m-0 mt-1 font-medium">
                            <span v-if="shipment.vehicle">{{ shipment.vehicle }}</span>
                            <Tag v-else value="Não informado" icon="pi pi-exclamation-triangle" severity="warn" />
                        </dd>
                    </div>
                </dl>

                <div class="mt-6">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="font-medium">
                            {{ doneCount }} de {{ items.length }} itens completos
                            <span v-if="itemsWithShortage" class="text-muted-color font-normal">· {{ itemsWithShortage }} com falta pendente</span>
                        </span>
                        <span class="text-muted-color">{{ progress }}%</span>
                    </div>
                    <ProgressBar :value="progress" :showValue="false" class="h-2" />
                </div>

                <Message v-if="!editable && picking.status === 'Em andamento'" severity="info" class="mt-4">Esta separação é de {{ picking.userName }}. Você pode acompanhar, mas só o responsável pode alterá-la.</Message>
                <Message v-if="openIssues.length" severity="warn" class="mt-4">
                    {{ openIssues.length === 1 ? 'Há 1 falta aguardando' : `Há ${openIssues.length} faltas aguardando` }} resolução do administrador. Continue separando os outros itens; a separação só pode ser concluída depois que as faltas forem
                    resolvidas.
                </Message>
            </template>
        </div>

        <div v-if="picking" class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 class="text-xl font-semibold m-0">Itens</h2>
                <SelectButton v-model="itemFilter" :options="itemFilterOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
            </div>

            <DataTable :value="visibleItems" dataKey="lineUuid" sortField="materialDescription" :sortOrder="1" stripedRows :rowClass="(item) => (item.accounted && item.saveState === 'saved' ? 'opacity-70' : '')">
                <template #empty>
                    <div class="py-6 text-center text-muted-color">{{ itemFilter === 'pending' ? 'Todos os itens foram separados ou têm a falta informada.' : 'Esta remessa não tem itens.' }}</div>
                </template>
                <Column field="materialCode" header="Código" sortable class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.materialCode }}</span>
                        <Tag v-if="data.replacedMaterialCode" :value="`Substitui ${data.replacedMaterialCode}`" icon="pi pi-arrow-right-arrow-left" severity="info" class="ml-2" />
                    </template>
                </Column>
                <Column field="materialDescription" header="Descrição" sortable />
                <Column field="requiredQty" header="Remessa" class="text-right whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ qtyFormat.format(data.requiredQty) }}</span>
                    </template>
                </Column>
                <Column header="Separado" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2">
                                <InputNumber
                                    v-if="editable"
                                    :modelValue="data.draftQty"
                                    :min="0"
                                    :max="Math.max(pickableQty(data), data.pickedQty)"
                                    :maxFractionDigits="3"
                                    locale="pt-BR"
                                    showButtons
                                    buttonLayout="horizontal"
                                    :inputStyle="{ width: '5.5rem', textAlign: 'center' }"
                                    :aria-label="`Quantidade separada de ${data.materialCode}`"
                                    @update:modelValue="onQtyInput(data, $event)"
                                >
                                    <template #incrementicon><span class="pi pi-plus" /></template>
                                    <template #decrementicon><span class="pi pi-minus" /></template>
                                </InputNumber>
                                <span v-else class="font-medium">{{ qtyFormat.format(data.pickedQty) }}</span>

                                <Button v-if="editable && data.draftQty < pickableQty(data)" label="Tudo" size="small" severity="secondary" outlined v-tooltip.top="'Separar todo o restante'" @click="fillItem(data)" />
                                <Button
                                    v-if="editable && data.remainingQty > 0"
                                    icon="pi pi-exclamation-triangle"
                                    size="small"
                                    severity="warn"
                                    text
                                    rounded
                                    :aria-label="`Informar falta de ${data.materialCode}`"
                                    v-tooltip.top="pendingSaves ? 'Aguarde salvar as quantidades' : 'Informar falta'"
                                    :disabled="pendingSaves"
                                    @click="openIssue(data)"
                                />
                                <i v-if="data.saveState === 'saving' || data.saveState === 'pending'" class="pi pi-spin pi-spinner text-muted-color" aria-label="Salvando"></i>
                                <i v-else-if="data.saveState === 'error'" class="pi pi-times-circle text-red-500" aria-label="Não salvo"></i>
                                <i v-else-if="data.done" class="pi pi-check-circle text-green-600 dark:text-green-400" aria-label="Completo"></i>
                                <i v-else-if="data.accounted" class="pi pi-check-circle text-orange-500" aria-label="Resolvido com falta"></i>
                            </div>
                            <Tag v-if="data.missingQty > 0" :value="`Falta: ${qtyFormat.format(data.missingQty)}`" icon="pi pi-exclamation-triangle" severity="warn" class="self-start" />
                            <Tag v-if="data.overQty > 0" :value="`Devolver ${qtyFormat.format(data.overQty)}: a remessa diminuiu`" icon="pi pi-reply" severity="danger" class="self-start" />
                            <small v-if="data.saveState === 'error'" class="text-red-500 whitespace-normal">{{ data.errorMessage }}</small>
                        </div>
                    </template>
                </Column>
            </DataTable>
        </div>

        <div v-if="removedItems.length" class="card mb-0 border-l-4 border-red-500">
            <h2 class="text-xl font-semibold m-0">Materiais para devolver</h2>
            <p class="text-muted-color mt-1 mb-4">Estes materiais já foram separados, mas saíram da remessa numa nova revisão. Devolva-os ao estoque e confirme.</p>
            <DataTable :value="removedItems" dataKey="lineUuid" size="small">
                <Column field="materialCode" header="Código" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.materialCode }}</span>
                    </template>
                </Column>
                <Column field="materialDescription" header="Descrição" />
                <Column field="pickedQty" header="Separado" class="text-right whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ qtyFormat.format(data.pickedQty) }}</span>
                    </template>
                </Column>
                <Column v-if="editable" header="" class="w-0 whitespace-nowrap">
                    <template #body="{ data }">
                        <Button label="Devolvido" icon="pi pi-reply" size="small" severity="danger" outlined :loading="returningUuid === data.lineUuid" @click="markReturned(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>

        <div v-if="picking && picking.issues.length" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Faltas informadas</h2>
            <DataTable :value="picking.issues" dataKey="uuid" size="small">
                <Column field="materialCode" header="Código" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.materialCode }}</span>
                    </template>
                </Column>
                <Column field="type" header="Motivo" class="whitespace-nowrap" />
                <Column field="qty" header="Quantidade" class="text-right whitespace-nowrap">
                    <template #body="{ data }">{{ data.qty === null ? '—' : qtyFormat.format(data.qty) }}</template>
                </Column>
                <Column field="description" header="Observação">
                    <template #body="{ data }">{{ data.description || '—' }}</template>
                </Column>
                <Column header="Situação">
                    <template #body="{ data }">
                        <Tag v-if="data.open" value="Aguardando administrador" severity="warn" />
                        <div v-else class="flex flex-col gap-1">
                            <Tag :value="data.resolution.type" :severity="data.resolution.revisionUuid ? 'info' : 'secondary'" class="self-start" />
                            <span v-if="data.resolution.note" class="text-xs">{{ data.resolution.note }}</span>
                            <span class="text-xs text-muted-color">{{ data.resolution.userName }} · {{ formatDateTime(data.resolution.createdAt) }}</span>
                        </div>
                    </template>
                </Column>
                <Column header="Informada" class="whitespace-nowrap">
                    <template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template>
                </Column>
                <Column v-if="editable" header="" class="w-0 whitespace-nowrap">
                    <template #body="{ data }">
                        <Button
                            v-if="data.open"
                            icon="pi pi-undo"
                            severity="secondary"
                            text
                            rounded
                            aria-label="Retirar falta"
                            v-tooltip.left="pendingSaves ? 'Aguarde salvar as quantidades' : 'Retirar falta informada por engano'"
                            :loading="withdrawingUuid === data.uuid"
                            :disabled="pendingSaves"
                            @click="confirmWithdraw(data)"
                        />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <PickingIssueDialog v-model:visible="issueVisible" :pickingUuid="pickingUuid" :item="issueItem" @reported="onIssueReported" />

    <Dialog v-model:visible="finishVisible" header="Concluir separação" modal :closable="!finishing" :style="{ width: '30rem' }" :breakpoints="{ '575px': '95vw' }">
        <form id="finish-form" class="flex flex-col gap-5" @submit.prevent="finish">
            <p class="m-0 text-muted-color">Todos os {{ items.length }} itens da remessa {{ label }} foram separados. Informe como foi a separação.</p>

            <div class="flex items-center justify-between gap-4">
                <label for="finish-inspection" class="font-medium">Cliente acompanhou a separação</label>
                <ToggleSwitch inputId="finish-inspection" v-model="finishForm.customerInspection" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                    <label for="finish-company" class="font-medium">Pessoas da Temec</label>
                    <InputNumber inputId="finish-company" v-model="finishForm.companyPersonQty" :min="1" :max="99" showButtons fluid />
                </div>
                <div class="flex flex-col gap-2">
                    <label for="finish-customer" class="font-medium">Pessoas do cliente</label>
                    <InputNumber inputId="finish-customer" v-model="finishForm.customerPersonQty" :min="0" :max="99" showButtons fluid />
                </div>
            </div>

            <Message v-if="finishError" severity="error" size="small" variant="simple">{{ finishError }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text :disabled="finishing" @click="finishVisible = false" />
            <Button type="submit" form="finish-form" label="Concluir" icon="pi pi-check" :loading="finishing" />
        </template>
    </Dialog>
</template>
