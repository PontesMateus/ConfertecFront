<script setup>
import { PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
import { PickingService } from '@/service/PickingService';
import { realtime } from '@/service/realtime';
import { session } from '@/service/session';
import { formatDateTime } from '@/utils/date';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PhotoButton from '@/views/photos/PhotoButton.vue';
import PhotoThumb from '@/views/photos/PhotoThumb.vue';
import PickingIssueDialog from './PickingIssueDialog.vue';

// Waits for the picker to stop typing before saving a quantity
const SAVE_DELAY_MS = 600;
// While a shortage waits for the administrator, checks for its resolution this often
/** Polling only while the real-time connection is down */
const REFRESH_INTERVAL_MS = 30_000;

/** The screen shows a batch: one or more shipments picked together, each one with its own picking */
const props = defineProps({
    batchUuid: { type: String, required: true }
});

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const batch = ref(null);
/**
 * One entry per picking line, with local edit state: draftQty (shown); pickedQty, missingQty, remainingQty,
 * accounted (saved); saveState. Also pickingUuid and shipmentLabel, since the batch mixes shipments.
 */
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
const finishPicking = ref(null);
const finishForm = reactive({ customerInspection: false, customerInspectorName: '', companyPersonQty: 1 });
const finishSubmitted = ref(false);
const inspectorName = computed(() => finishForm.customerInspectorName.trim());
/** Photo of the inspector's ID document, sent as soon as it is taken; required to finish with an inspection */
const inspectorPhotoUuid = ref(null);
const inspectorPhotoSending = ref(false);
const inspectorPhotoError = ref('');
/** Material whose photo is being sent, and photo being removed: one photo change at a time */
const photoMaterialUuid = ref(null);
const removingPhotoUuid = ref(null);
const photoBusy = computed(() => Boolean(photoMaterialUuid.value || removingPhotoUuid.value));

const issueVisible = ref(false);
const issueItem = ref(null);
const starting = ref(false);
const withdrawingUuid = ref(null);
const returningUuid = ref(null);

const timers = new Map();
const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const myUuid = computed(() => session.state.user?.uuid);
const pickings = computed(() => batch.value?.pickings ?? []);
const multiple = computed(() => pickings.value.length > 1);
const batchMine = computed(() => batch.value?.userUuid === myUuid.value);
const title = computed(() => pickings.value.map((picking) => shipmentLabel(picking.shipment)).join(', '));
const pendingSaves = computed(() => items.value.some(isSaving));
const anyInProgress = computed(() => pickings.value.some((picking) => picking.status === 'Em andamento'));
/** Assigned by the Encarregado and not started yet: the picker starts the whole batch at once */
const anyPending = computed(() => pickings.value.some((picking) => picking.status === 'Pendente'));
const editablePickingUuids = computed(() => new Set(pickings.value.filter(isEditable).map((picking) => picking.uuid)));
const openIssues = computed(() => pickings.value.flatMap((picking) => picking.issues.filter((issue) => issue.open).map((issue) => ({ ...issue, pickingUuid: picking.uuid }))));

function shipmentLabel(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

function isEditable(picking) {
    return picking.status === 'Em andamento' && picking.userUuid === myUuid.value;
}

function entryEditable(entry) {
    return editablePickingUuids.value.has(entry.pickingUuid);
}

function isSaving(entry) {
    return entry.saveState === 'pending' || entry.saveState === 'saving';
}

// "Accounted": nothing left for the picker to do (picked in full, or the rest reported missing), photo included
function isPending(entry) {
    return !entry.accounted || entry.overQty > 0 || entry.needsPhoto || entry.saveState !== 'saved';
}

/**
 * Lines grouped by material: a material on several shipments has one counter per shipment, and its photos are shared
 * by all of them (they are of the batch's material)
 */
const materials = computed(() => {
    const byCode = new Map();
    for (const entry of items.value) {
        if (!byCode.has(entry.materialCode)) byCode.set(entry.materialCode, { materialUuid: entry.materialUuid, materialCode: entry.materialCode, materialDescription: entry.materialDescription, entries: [] });
        byCode.get(entry.materialCode).entries.push(entry);
    }
    return [...byCode.values()].map((material) => ({
        ...material,
        requiredQty: Math.round(material.entries.reduce((sum, entry) => sum + entry.requiredQty, 0) * 1000) / 1000,
        replacedMaterialCodes: [...new Set(material.entries.map((entry) => entry.replacedMaterialCode).filter(Boolean))],
        pending: material.entries.some(isPending),
        photoUuids: [...new Set(material.entries.flatMap((entry) => entry.photoUuids))],
        needsPhoto: material.entries.some((entry) => entry.needsPhoto),
        photoEditable: material.entries.some(entryEditable)
    }));
});
const visibleMaterials = computed(() => (itemFilter.value === 'pending' ? materials.value.filter((material) => material.pending) : materials.value));

/** Progress and finish state of each picking, by uuid */
const summaries = computed(() => {
    const result = new Map();
    for (const picking of pickings.value) {
        const entries = items.value.filter((entry) => entry.pickingUuid === picking.uuid);
        const done = entries.filter((entry) => entry.done).length;
        const openIssueCount = picking.issues.filter((issue) => issue.open).length;
        const overCount = entries.filter((entry) => entry.overQty > 0).length;
        const saving = entries.some(isSaving);
        let finishHint = 'Separe todos os itens por completo para concluir';
        if (openIssueCount) finishHint = 'Há faltas aguardando resolução do administrador';
        else if (picking.removedItems.length || overCount) finishHint = 'Devolva os materiais em excesso para concluir';
        else if (entries.some((entry) => entry.needsPhoto)) finishHint = 'Tire a foto dos materiais separados para concluir';
        result.set(picking.uuid, {
            total: entries.length,
            done,
            progress: entries.length ? Math.round((done / entries.length) * 100) : 0,
            withShortage: entries.filter((entry) => entry.missingQty > 0).length,
            openIssueCount,
            canFinish: isEditable(picking) && entries.length > 0 && done === entries.length && !openIssueCount && !picking.removedItems.length && !saving,
            finishHint
        });
    }
    return result;
});

/** Picked materials a new revision took out of a shipment: they go back before finishing */
const removedItems = computed(() => pickings.value.flatMap((picking) => picking.removedItems.map((item) => ({ ...item, pickingUuid: picking.uuid, shipmentLabel: shipmentLabel(picking.shipment), editable: isEditable(picking) }))));
const issues = computed(() => pickings.value.flatMap((picking) => picking.issues.map((issue) => ({ ...issue, pickingUuid: picking.uuid, shipmentLabel: shipmentLabel(picking.shipment), editable: isEditable(picking) }))));

function toLocalItem(item, picking) {
    return { ...item, pickingUuid: picking.uuid, shipmentLabel: shipmentLabel(picking.shipment), draftQty: item.pickedQty, saveState: 'saved', errorMessage: '', seq: 0 };
}

/** Max the picker can type: the shipment quantity minus what is reported missing */
function pickableQty(item) {
    return Math.round((item.requiredQty - item.missingQty) * 1000) / 1000;
}

/** Replaces the whole batch; only called with no save pending, so no typed quantity is lost */
function applyBatch(value) {
    batch.value = value;
    items.value = value.pickings.flatMap((picking) => picking.items.map((item) => toLocalItem(item, picking)));
}

/** Replaces one picking of the batch, keeping the local state of the other pickings' lines */
function applyPicking(value) {
    const index = batch.value.pickings.findIndex((picking) => picking.uuid === value.uuid);
    if (index === -1) return;
    batch.value.pickings.splice(index, 1, value);
    items.value = batch.value.pickings.flatMap((picking) => (picking.uuid === value.uuid ? value.items.map((item) => toLocalItem(item, value)) : items.value.filter((entry) => entry.pickingUuid === picking.uuid)));
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        applyBatch(await PickingService.getBatch(props.batchUuid));
        document.title = `Separação ${title.value} | Confertec`;
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

const refreshBlocked = computed(() => pendingSaves.value || issueVisible.value || finishVisible.value || loading.value || Boolean(photoMaterialUuid.value));
/** A refresh was asked while blocked; it runs as soon as the save ends or the dialog closes */
let refreshPending = false;
watch(refreshBlocked, (blocked) => {
    if (!blocked && refreshPending) refresh();
});

/** Reloads when it is safe (no quantity being saved, no dialog open) and tells which shortages were resolved. */
async function refresh() {
    if (refreshBlocked.value) {
        refreshPending = true;
        return;
    }
    refreshPending = false;
    const wasOpen = new Set(openIssues.value.map((issue) => issue.uuid));
    try {
        applyBatch(await PickingService.getBatch(props.batchUuid));
    } catch (error) {
        // The Encarregado gave the batch to someone else, or took this shipment out of it
        if (error.status === 400) {
            toast.add({ severity: 'warn', summary: 'Separação reatribuída', detail: error.message, life: 8000 });
            router.push({ name: 'home' });
        }
        return; // Otherwise keeps the current screen; the next tick or the button tries again
    }
    for (const issue of issues.value.filter((candidate) => wasOpen.has(candidate.uuid) && candidate.resolution)) {
        const detail = issue.resolution.revisionUuid ? `${issue.materialCode}: substituído, confira os itens` : `${issue.materialCode}: aguardar reposição`;
        toast.add({ severity: 'info', summary: 'Falta resolvida pelo administrador', detail: multiple.value ? `Remessa ${issue.shipmentLabel} · ${detail}` : detail, life: 8000 });
    }
}

let refreshTimer = null;
let unsubscribe = null;
let unsubscribeBatch = null;
onMounted(() => {
    // An administrator resolved an issue of a picking on this screen; after a reconnection, events may have been missed
    unsubscribe = realtime.subscribe('picking.changed', (message) => {
        if (message.reconnected || pickings.value.some((picking) => picking.uuid === message.pickingUuid)) refresh();
    });
    // The Encarregado changed the batch: its shipments, its picker or its checker
    unsubscribeBatch = realtime.subscribe('pickingBatch.changed', (message) => {
        if (message.reconnected || message.batchUuid === props.batchUuid) refresh();
    });
    refreshTimer = setInterval(() => {
        if (!realtime.connected.value && openIssues.value.some((issue) => editablePickingUuids.value.has(issue.pickingUuid))) refresh();
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
        const saved = await PickingService.setItemQty(item.pickingUuid, item.lineUuid, item.draftQty);
        if (seq !== item.seq) return;
        Object.assign(item, {
            pickedQty: saved.pickedQty,
            done: saved.done,
            missingQty: saved.missingQty,
            remainingQty: saved.remainingQty,
            accounted: saved.accounted,
            overQty: saved.overQty,
            photoUuids: saved.photoUuids,
            needsPhoto: saved.needsPhoto,
            saveState: 'saved'
        });
    } catch (error) {
        if (seq !== item.seq) return;
        // Back to the last saved value, so the screen never shows a quantity the server does not have
        Object.assign(item, { draftQty: item.pickedQty, saveState: 'error', errorMessage: error.message });
    }
}

/** Updates the photos of the material's lines from a photo response; typed quantities are kept */
function applyMaterialPhotos(result) {
    for (const saved of result.items) {
        const entry = items.value.find((candidate) => candidate.pickingUuid === saved.pickingUuid && candidate.lineUuid === saved.lineUuid);
        if (entry) Object.assign(entry, { photoUuids: saved.photoUuids, needsPhoto: saved.needsPhoto, done: saved.done });
    }
}

/** Adds a photo to the material's photos */
async function sendMaterialPhoto(material, photo) {
    photoMaterialUuid.value = material.materialUuid;
    try {
        applyMaterialPhotos(await PickingService.addMaterialPhoto(props.batchUuid, material.materialUuid, photo));
        toast.add({ severity: 'success', summary: 'Foto enviada', detail: material.materialCode, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível enviar a foto', detail: error.message, life: 5000 });
    } finally {
        photoMaterialUuid.value = null;
    }
}

function confirmRemoveMaterialPhoto(material, photoUuid) {
    const last = material.photoUuids.length === 1;
    confirm.require({
        header: 'Excluir foto',
        message: `A foto de ${material.materialCode} será excluída.${last ? ' Sem fotos, o material volta a ficar pendente.' : ''} Deseja continuar?`,
        icon: 'pi pi-trash',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Excluir foto', severity: 'danger' },
        accept: () => removeMaterialPhoto(material, photoUuid)
    });
}

async function removeMaterialPhoto(material, photoUuid) {
    removingPhotoUuid.value = photoUuid;
    try {
        applyMaterialPhotos(await PickingService.removeMaterialPhoto(props.batchUuid, material.materialUuid, photoUuid));
        toast.add({ severity: 'success', summary: 'Foto excluída', detail: material.materialCode, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível excluir a foto', detail: error.message, life: 5000 });
    } finally {
        removingPhotoUuid.value = null;
    }
}

async function sendInspectorPhoto(photo) {
    inspectorPhotoSending.value = true;
    inspectorPhotoError.value = '';
    try {
        const { photoUuid } = await PickingService.setInspectorPhoto(finishPicking.value.uuid, photo);
        inspectorPhotoUuid.value = photoUuid;
        finishPicking.value.customerInspectorPhotoUuid = photoUuid;
    } catch (error) {
        inspectorPhotoError.value = error.message;
    } finally {
        inspectorPhotoSending.value = false;
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
        await PickingService.setItemQty(item.pickingUuid, item.lineUuid, 0);
        const picking = batch.value.pickings.find((candidate) => candidate.uuid === item.pickingUuid);
        picking.removedItems = picking.removedItems.filter((removed) => removed.lineUuid !== item.lineUuid);
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
    toast.add({ severity: 'warn', summary: 'Falta informada', detail: multiple.value ? `${item.materialCode} · remessa ${item.shipmentLabel}` : item.materialCode, life: 3000 });
}

function confirmWithdraw(issue) {
    confirm.require({
        header: 'Retirar falta',
        message: `A falta de ${qtyFormat.format(issue.qty)} em ${issue.materialCode}${multiple.value ? ` (remessa ${issue.shipmentLabel})` : ''} será retirada e o item voltará a ficar pendente. Deseja continuar?`,
        icon: 'pi pi-undo',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Retirar falta', severity: 'warn' },
        accept: () => withdraw(issue)
    });
}

async function withdraw(issue) {
    withdrawingUuid.value = issue.uuid;
    try {
        applyPicking(await PickingService.withdrawIssue(issue.pickingUuid, issue.uuid));
        toast.add({ severity: 'success', summary: 'Falta retirada', detail: issue.materialCode, life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível retirar', detail: error.message, life: 5000 });
    } finally {
        withdrawingUuid.value = null;
    }
}

function confirmStart() {
    confirm.require({
        header: 'Iniciar separação',
        message: multiple.value ? `Você vai iniciar a separação das ${pickings.value.length} remessas deste grupo. Deseja continuar?` : 'Você vai iniciar a separação desta remessa. Deseja continuar?',
        icon: 'pi pi-play',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Iniciar separação' },
        accept: start
    });
}

async function start() {
    starting.value = true;
    try {
        applyBatch(await PickingService.startBatch(props.batchUuid));
        toast.add({ severity: 'success', summary: 'Separação iniciada', life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível iniciar', detail: error.message, life: 5000 });
    } finally {
        starting.value = false;
    }
}

function openFinish(picking) {
    finishPicking.value = picking;
    finishForm.customerInspection = picking.customerInspection;
    finishForm.customerInspectorName = picking.customerInspectorName ?? '';
    finishForm.companyPersonQty = picking.companyPersonQty;
    inspectorPhotoUuid.value = picking.customerInspectorPhotoUuid ?? null;
    inspectorPhotoError.value = '';
    finishSubmitted.value = false;
    finishError.value = '';
    finishVisible.value = true;
}

async function finish() {
    const picking = finishPicking.value;
    const label = shipmentLabel(picking.shipment);
    finishSubmitted.value = true;
    if (finishForm.customerInspection && (!inspectorName.value || !inspectorPhotoUuid.value)) return;
    finishing.value = true;
    finishError.value = '';
    try {
        const finished = await PickingService.finish(picking.uuid, {
            customerInspection: finishForm.customerInspection,
            // Only sent with an inspection: the API stores no name without one
            customerInspectorName: finishForm.customerInspection ? inspectorName.value : undefined,
            companyPersonQty: finishForm.companyPersonQty ?? 1
        });
        finishVisible.value = false;
        toast.add({ severity: 'success', summary: 'Separação concluída', detail: `Remessa ${label}`, life: 4000 });
        applyPicking(finished);
        // Nothing left to pick here: back to the list
        if (!editablePickingUuids.value.size) router.push({ name: 'home' });
    } catch (error) {
        finishError.value = error.message;
    } finally {
        finishing.value = false;
    }
}

watch(() => props.batchUuid, load, { immediate: true });
onBeforeUnmount(() => {
    clearInterval(refreshTimer);
    unsubscribe?.();
    unsubscribeBatch?.();
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
                            Separação <span v-if="title">{{ title }}</span>
                        </h1>
                        <div v-if="batch" class="flex flex-wrap items-center gap-2 mt-1 text-muted-color">
                            <span>Responsável: {{ batch.userName }}</span>
                            <span>·</span>
                            <span>Atribuída em {{ formatDateTime(batch.createdAt) }}</span>
                            <template v-if="multiple">
                                <span>·</span>
                                <span>{{ pickings.length }} remessas</span>
                            </template>
                        </div>
                    </div>
                </div>
                <div v-if="batch" class="flex gap-2">
                    <Button icon="pi pi-refresh" severity="secondary" outlined aria-label="Atualizar" v-tooltip.bottom="'Atualizar'" :disabled="pendingSaves" @click="refresh" />
                    <Button v-if="batchMine && anyPending" label="Iniciar separação" icon="pi pi-play" :loading="starting" @click="confirmStart" />
                </div>
            </div>

            <Message v-if="loadError" severity="error" class="mt-4">
                <div class="flex flex-wrap items-center gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
                </div>
            </Message>

            <div v-if="loading && !batch" class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <Skeleton v-for="n in 4" :key="n" height="2.75rem" />
            </div>

            <template v-else-if="batch">
                <Message v-if="batchMine && anyPending" severity="info" class="mt-4">Inicie a separação para registrar as quantidades separadas.</Message>
                <Message v-if="!batchMine && anyInProgress" severity="info" class="mt-4">Esta separação é de {{ batch.userName }}. Você pode acompanhar, mas só o responsável pode alterá-la.</Message>
                <Message v-if="openIssues.length" severity="warn" class="mt-4">
                    {{ openIssues.length === 1 ? 'Há 1 falta aguardando' : `Há ${openIssues.length} faltas aguardando` }} resolução do administrador. Continue separando os outros itens; a remessa com falta só pode ser concluída depois que a falta for
                    resolvida.
                </Message>

                <div class="grid grid-cols-1 gap-4 mt-6" :class="{ 'xl:grid-cols-2': multiple }">
                    <section v-for="picking in pickings" :key="picking.uuid" class="flex flex-col gap-4" :class="{ 'border border-surface rounded-border p-4': multiple }">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div class="flex flex-wrap items-center gap-2">
                                    <h2 v-if="multiple" class="text-lg font-semibold m-0">Remessa {{ shipmentLabel(picking.shipment) }}</h2>
                                    <Tag :value="picking.status" :severity="PICKING_STATUS_SEVERITY[picking.status]" />
                                    <span class="text-sm text-muted-color">Revisão {{ picking.shipment.revisionNumber }}</span>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <Button
                                    v-if="isEditable(picking)"
                                    :label="multiple ? 'Concluir remessa' : 'Concluir separação'"
                                    icon="pi pi-check"
                                    :size="multiple ? 'small' : undefined"
                                    :disabled="!summaries.get(picking.uuid).canFinish"
                                    v-tooltip.bottom="summaries.get(picking.uuid).canFinish ? null : summaries.get(picking.uuid).finishHint"
                                    @click="openFinish(picking)"
                                />
                            </div>
                        </div>

                        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 m-0" :class="{ 'md:grid-cols-4': !multiple }">
                            <div>
                                <dt class="text-sm text-muted-color">Saída</dt>
                                <dd class="m-0 mt-1 font-medium">{{ formatDateTime(picking.shipment.shippingAt) }}</dd>
                            </div>
                            <div>
                                <dt class="text-sm text-muted-color">Cliente</dt>
                                <dd class="m-0 mt-1 font-medium">{{ picking.shipment.customer || '—' }}</dd>
                            </div>
                            <div>
                                <dt class="text-sm text-muted-color">Obra</dt>
                                <dd class="m-0 mt-1 font-medium">{{ picking.shipment.venture || '—' }}</dd>
                            </div>
                            <div>
                                <dt class="text-sm text-muted-color">Veículo</dt>
                                <dd class="m-0 mt-1 font-medium">
                                    <span v-if="picking.shipment.vehicle">{{ picking.shipment.vehicle }}</span>
                                    <Tag v-else value="Não informado" icon="pi pi-exclamation-triangle" severity="warn" />
                                </dd>
                            </div>
                        </dl>

                        <div>
                            <div class="flex justify-between text-sm mb-2">
                                <span class="font-medium">
                                    {{ summaries.get(picking.uuid).done }} de {{ summaries.get(picking.uuid).total }} itens completos
                                    <span v-if="summaries.get(picking.uuid).withShortage" class="text-muted-color font-normal">· {{ summaries.get(picking.uuid).withShortage }} com falta pendente</span>
                                </span>
                                <span class="text-muted-color">{{ summaries.get(picking.uuid).progress }}%</span>
                            </div>
                            <ProgressBar :value="summaries.get(picking.uuid).progress" :showValue="false" class="h-2" />
                        </div>
                    </section>
                </div>
            </template>
        </div>

        <div v-if="batch" class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 class="text-xl font-semibold m-0">Itens</h2>
                <SelectButton v-model="itemFilter" :options="itemFilterOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
            </div>

            <DataTable :value="visibleMaterials" dataKey="materialCode" sortField="materialDescription" :sortOrder="1" stripedRows :rowClass="(material) => (material.pending ? '' : 'opacity-70')">
                <template #empty>
                    <div class="py-6 text-center text-muted-color">{{ itemFilter === 'pending' ? 'Todos os itens foram separados ou têm a falta informada.' : 'Esta separação não tem itens.' }}</div>
                </template>
                <Column field="materialCode" header="Código" sortable class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.materialCode }}</span>
                        <Tag v-for="code in data.replacedMaterialCodes" :key="code" :value="`Substitui ${code}`" icon="pi pi-arrow-right-arrow-left" severity="info" class="ml-2" />
                    </template>
                </Column>
                <Column field="materialDescription" header="Descrição" sortable />
                <Column field="requiredQty" :header="multiple ? 'Total' : 'Remessa'" class="text-right whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ qtyFormat.format(data.requiredQty) }}</span>
                        <div v-if="data.entries.length > 1" class="text-xs text-muted-color">em {{ data.entries.length }} remessas</div>
                    </template>
                </Column>
                <Column header="Separado" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <div class="flex flex-col gap-3">
                            <div v-for="entry in data.entries" :key="entry.lineUuid" class="flex flex-col gap-1">
                                <div v-if="multiple" class="text-xs text-muted-color">
                                    Remessa <span class="font-medium text-color">{{ entry.shipmentLabel }}</span> · {{ qtyFormat.format(entry.requiredQty) }}
                                </div>
                                <div class="flex items-center gap-2">
                                    <InputNumber
                                        v-if="entryEditable(entry)"
                                        :modelValue="entry.draftQty"
                                        :min="0"
                                        :max="Math.max(pickableQty(entry), entry.pickedQty)"
                                        :maxFractionDigits="3"
                                        locale="pt-BR"
                                        showButtons
                                        buttonLayout="horizontal"
                                        :inputStyle="{ width: '5.5rem', textAlign: 'center' }"
                                        :aria-label="multiple ? `Quantidade separada de ${entry.materialCode} para a remessa ${entry.shipmentLabel}` : `Quantidade separada de ${entry.materialCode}`"
                                        @update:modelValue="onQtyInput(entry, $event)"
                                    >
                                        <template #incrementicon><span class="pi pi-plus" /></template>
                                        <template #decrementicon><span class="pi pi-minus" /></template>
                                    </InputNumber>
                                    <span v-else class="font-medium">{{ qtyFormat.format(entry.pickedQty) }}</span>

                                    <Button v-if="entryEditable(entry) && entry.draftQty < pickableQty(entry)" label="Tudo" size="small" severity="secondary" outlined v-tooltip.top="'Separar todo o restante'" @click="fillItem(entry)" />
                                    <Button
                                        v-if="entryEditable(entry) && entry.remainingQty > 0"
                                        icon="pi pi-exclamation-triangle"
                                        size="small"
                                        severity="warn"
                                        text
                                        rounded
                                        :aria-label="`Informar falta de ${entry.materialCode}`"
                                        v-tooltip.top="pendingSaves ? 'Aguarde salvar as quantidades' : 'Informar falta'"
                                        :disabled="pendingSaves"
                                        @click="openIssue(entry)"
                                    />
                                    <i v-if="isSaving(entry)" class="pi pi-spin pi-spinner text-muted-color" aria-label="Salvando"></i>
                                    <i v-else-if="entry.saveState === 'error'" class="pi pi-times-circle text-red-500" aria-label="Não salvo"></i>
                                    <i v-else-if="entry.done" class="pi pi-check-circle text-green-600 dark:text-green-400" aria-label="Completo"></i>
                                    <i v-else-if="entry.accounted" class="pi pi-check-circle text-orange-500" aria-label="Resolvido com falta"></i>
                                </div>
                                <Tag v-if="entry.missingQty > 0" :value="`Falta: ${qtyFormat.format(entry.missingQty)}`" icon="pi pi-exclamation-triangle" severity="warn" class="self-start" />
                                <Tag v-if="entry.overQty > 0" :value="`Devolver ${qtyFormat.format(entry.overQty)}: a remessa diminuiu`" icon="pi pi-reply" severity="danger" class="self-start" />
                                <small v-if="entry.saveState === 'error'" class="text-red-500 whitespace-normal">{{ entry.errorMessage }}</small>
                            </div>
                        </div>
                    </template>
                </Column>
                <Column header="Fotos">
                    <template #body="{ data }">
                        <div class="flex flex-col gap-2 items-start">
                            <div class="flex flex-wrap items-center gap-2 max-w-64">
                                <div v-for="(photoUuid, index) in data.photoUuids" :key="photoUuid" class="relative">
                                    <PhotoThumb :photoUuid="photoUuid" :alt="`Foto ${index + 1} de ${data.materialCode} separado`" />
                                    <Button
                                        v-if="data.photoEditable"
                                        icon="pi pi-times"
                                        severity="danger"
                                        rounded
                                        class="!absolute -top-2 -right-2 !w-6 !h-6 !p-0"
                                        :aria-label="`Excluir a foto ${index + 1} de ${data.materialCode}`"
                                        v-tooltip.top="'Excluir foto'"
                                        :loading="removingPhotoUuid === photoUuid"
                                        :disabled="photoBusy && removingPhotoUuid !== photoUuid"
                                        @click="confirmRemoveMaterialPhoto(data, photoUuid)"
                                    />
                                </div>
                                <PhotoButton
                                    v-if="data.photoEditable"
                                    :label="data.photoUuids.length ? 'Adicionar' : 'Foto'"
                                    size="small"
                                    :severity="data.needsPhoto ? undefined : 'secondary'"
                                    :outlined="!data.needsPhoto"
                                    :ariaLabel="`${data.photoUuids.length ? 'Adicionar outra foto' : 'Tirar foto'} de ${data.materialCode}`"
                                    :loading="photoMaterialUuid === data.materialUuid"
                                    :disabled="photoBusy && photoMaterialUuid !== data.materialUuid"
                                    @selected="sendMaterialPhoto(data, $event)"
                                />
                                <span v-else-if="!data.photoUuids.length" class="text-muted-color">—</span>
                            </div>
                            <Tag v-if="data.needsPhoto" value="Falta a foto" icon="pi pi-camera" severity="warn" />
                        </div>
                    </template>
                </Column>
            </DataTable>
        </div>

        <div v-if="removedItems.length" class="card mb-0 border-l-4 border-red-500">
            <h2 class="text-xl font-semibold m-0">Materiais para devolver</h2>
            <p class="text-muted-color mt-1 mb-4">Estes materiais já foram separados, mas saíram da remessa numa nova revisão. Devolva-os ao estoque e confirme.</p>
            <DataTable :value="removedItems" dataKey="lineUuid" size="small">
                <Column v-if="multiple" field="shipmentLabel" header="Remessa" class="whitespace-nowrap" />
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
                <Column header="" class="w-0 whitespace-nowrap">
                    <template #body="{ data }">
                        <Button v-if="data.editable" label="Devolvido" icon="pi pi-reply" size="small" severity="danger" outlined :loading="returningUuid === data.lineUuid" @click="markReturned(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>

        <div v-if="issues.length" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Faltas informadas</h2>
            <DataTable :value="issues" dataKey="uuid" size="small">
                <Column v-if="multiple" field="shipmentLabel" header="Remessa" class="whitespace-nowrap" />
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
                <Column header="" class="w-0 whitespace-nowrap">
                    <template #body="{ data }">
                        <Button
                            v-if="data.open && data.editable"
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

    <PickingIssueDialog v-model:visible="issueVisible" :pickingUuid="issueItem?.pickingUuid ?? ''" :item="issueItem" :shipmentLabel="multiple ? issueItem?.shipmentLabel : null" @reported="onIssueReported" />

    <Dialog v-model:visible="finishVisible" :header="multiple ? 'Concluir remessa' : 'Concluir separação'" modal :closable="!finishing" :style="{ width: '30rem' }" :breakpoints="{ '575px': '95vw' }">
        <form v-if="finishPicking" id="finish-form" class="flex flex-col gap-5" @submit.prevent="finish">
            <p class="m-0 text-muted-color">
                Todos os {{ summaries.get(finishPicking.uuid)?.total }} itens da remessa {{ shipmentLabel(finishPicking.shipment) }} foram separados. Informe como foi a separação.
                <template v-if="multiple">As remessas desta tela são conferidas juntas: a conferência só começa quando todas estiverem concluídas.</template>
            </p>

            <div class="flex items-center justify-between gap-4">
                <label for="finish-inspection" class="font-medium">Cliente acompanhou a separação</label>
                <ToggleSwitch inputId="finish-inspection" v-model="finishForm.customerInspection" />
            </div>

            <div v-if="finishForm.customerInspection" class="flex flex-col gap-2">
                <label for="finish-inspector" class="font-medium">Inspetor do cliente</label>
                <InputText id="finish-inspector" v-model="finishForm.customerInspectorName" maxlength="255" placeholder="Nome de quem acompanhou" :invalid="finishSubmitted && !inspectorName" fluid />
                <small v-if="finishSubmitted && !inspectorName" class="text-red-500">Informe o nome do inspetor do cliente</small>
            </div>

            <div v-if="finishForm.customerInspection" class="flex flex-col gap-2">
                <span class="font-medium">Documento do inspetor</span>
                <div class="flex items-center gap-3">
                    <PhotoThumb v-if="inspectorPhotoUuid" :photoUuid="inspectorPhotoUuid" alt="Foto do documento do inspetor do cliente" sizeClass="w-16 h-16" />
                    <PhotoButton
                        :label="inspectorPhotoUuid ? 'Trocar foto' : 'Tirar foto do documento'"
                        size="small"
                        :severity="inspectorPhotoUuid ? 'secondary' : undefined"
                        :outlined="Boolean(inspectorPhotoUuid)"
                        :loading="inspectorPhotoSending"
                        :disabled="finishing"
                        @selected="sendInspectorPhoto"
                    />
                </div>
                <small v-if="inspectorPhotoError" class="text-red-500">{{ inspectorPhotoError }}</small>
                <small v-else-if="finishSubmitted && !inspectorPhotoUuid" class="text-red-500">Tire a foto do documento do inspetor do cliente</small>
                <small v-else class="text-muted-color">Documento com foto (RG ou CNH) de quem acompanhou.</small>
            </div>

            <div class="flex flex-col gap-2 sm:w-1/2">
                <label for="finish-company" class="font-medium">Pessoas da Temec</label>
                <InputNumber inputId="finish-company" v-model="finishForm.companyPersonQty" :min="1" :max="99" showButtons fluid />
            </div>

            <Message v-if="finishError" severity="error" size="small" variant="simple">{{ finishError }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text :disabled="finishing" @click="finishVisible = false" />
            <Button type="submit" form="finish-form" label="Concluir" icon="pi pi-check" :loading="finishing" :disabled="inspectorPhotoSending" />
        </template>
    </Dialog>
</template>
