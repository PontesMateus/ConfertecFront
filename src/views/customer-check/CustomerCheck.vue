<script setup>
import { CustomerCheckService } from '@/service/CustomerCheckService';
import { formatDateTime } from '@/utils/date';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

// Waits for the inspector to stop typing before saving a count
const SAVE_DELAY_MS = 600;
// localStorage: the session key that binds the link to this browser, so reopening it goes on with the check
const SESSION_KEY_PREFIX = 'confertec.customerCheck.';

/**
 * Public page, opened from the QR Code: the customer's inspector checks the batch without a login. Not blind: each
 * material shows the expected quantity, and the check only finishes when every count matches.
 */
const props = defineProps({
    token: { type: String, required: true }
});

const check = ref(null);
/** One entry per material, with local edit state: draftQty (shown), countedQty and matches (saved), saveState */
const items = ref([]);
const loading = ref(true);
const loadError = ref('');
const name = ref('');
const nameSubmitted = ref(false);
const starting = ref(false);
const startError = ref('');
const finishing = ref(false);
const finishError = ref('');
const itemFilter = ref('all');
const itemFilterOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Pendentes', value: 'pending' }
];
const search = ref('');

const timers = new Map();
const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const storageKey = computed(() => SESSION_KEY_PREFIX + props.token);
const shipmentLabels = computed(() => check.value?.shipments.map((shipment) => `${shipment.record}-${shipment.recordReceipt}`).join(', '));
const customerName = computed(() => check.value?.shipments[0]?.customer);
/** Saved, matching, and still what the field shows (a cleared field is not saved, so it is not confirmed either) */
function isConfirmed(item) {
    return item.saveState === 'saved' && item.matches && item.draftQty === item.countedQty;
}

/** Saved and different from the expected quantity */
function isDifferent(item) {
    return item.saveState === 'saved' && item.countedQty !== null && item.draftQty === item.countedQty && !item.matches;
}

const matchedCount = computed(() => items.value.filter(isConfirmed).length);
const pendingSaves = computed(() => items.value.some((item) => item.saveState === 'pending' || item.saveState === 'saving'));
const allMatch = computed(() => items.value.length > 0 && matchedCount.value === items.value.length);
/** Pending: not confirmed yet; an item being saved stays until the save confirms it */
const visibleItems = computed(() => {
    const term = normalize(search.value.trim());
    return items.value.filter((item) => itemFilter.value !== 'pending' || !isConfirmed(item)).filter((item) => !term || [item.materialDescription, item.materialCode].some((value) => value && normalize(value).includes(term)));
});

/** Case- and accent-insensitive */
function normalize(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function byDescription(a, b) {
    return a.materialDescription.localeCompare(b.materialDescription, 'pt-BR', { sensitivity: 'base', numeric: true });
}

function readSessionKey() {
    try {
        return localStorage.getItem(storageKey.value);
    } catch {
        return null;
    }
}

function saveSessionKey(sessionKey) {
    try {
        localStorage.setItem(storageKey.value, sessionKey);
    } catch {
        // Private mode: the check still works while this page stays open
    }
}

let sessionKey = null;

function applyCheck(value) {
    check.value = value;
    if (!name.value) name.value = value.inspectorName ?? '';
    items.value = value.items.map((item) => ({ ...item, draftQty: item.countedQty, saveState: 'saved', errorMessage: '', seq: 0 })).sort(byDescription);
}

async function load() {
    loading.value = true;
    loadError.value = '';
    sessionKey = readSessionKey();
    try {
        applyCheck(await CustomerCheckService.get(props.token, sessionKey));
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

async function start() {
    nameSubmitted.value = true;
    startError.value = '';
    if (!name.value.trim()) return;
    starting.value = true;
    try {
        const result = await CustomerCheckService.start(props.token, name.value.trim(), sessionKey);
        sessionKey = result.sessionKey;
        saveSessionKey(sessionKey);
        applyCheck(result.check);
    } catch (error) {
        startError.value = error.message;
    } finally {
        starting.value = false;
    }
}

function onQtyInput(item, value) {
    item.draftQty = value;
    item.errorMessage = '';
    clearTimeout(timers.get(item.materialUuid));
    if (value === null || value === undefined) {
        item.saveState = 'saved';
        return;
    }
    item.saveState = 'pending';
    timers.set(
        item.materialUuid,
        setTimeout(() => save(item), SAVE_DELAY_MS)
    );
}

async function save(item) {
    timers.delete(item.materialUuid);
    // Only the latest request of a material may update it, if the inspector typed again meanwhile
    const seq = ++item.seq;
    item.saveState = 'saving';
    try {
        const saved = await CustomerCheckService.setItemQty(props.token, sessionKey, item.materialUuid, item.draftQty);
        if (seq !== item.seq) return;
        Object.assign(item, { countedQty: saved.countedQty, matches: saved.matches, saveState: 'saved' });
    } catch (error) {
        if (seq !== item.seq) return;
        // Back to the last saved value, so the screen never shows a count the server does not have
        Object.assign(item, { draftQty: item.countedQty, saveState: 'error', errorMessage: error.message });
    }
}

async function finish() {
    finishing.value = true;
    finishError.value = '';
    try {
        applyCheck(await CustomerCheckService.finish(props.token, sessionKey));
    } catch (error) {
        finishError.value = error.message;
    } finally {
        finishing.value = false;
    }
}

function flushPendingSaves() {
    for (const [materialUuid, timer] of timers) {
        clearTimeout(timer);
        const item = items.value.find((candidate) => candidate.materialUuid === materialUuid);
        if (item) save(item);
    }
}

watch(() => props.token, load, { immediate: true });
onBeforeUnmount(flushPendingSaves);
</script>

<template>
    <div class="min-h-screen bg-surface-50 dark:bg-surface-950 px-4 py-6">
        <div class="max-w-2xl mx-auto flex flex-col gap-4">
            <div class="flex items-center gap-3">
                <i class="pi pi-check-square text-3xl text-brand"></i>
                <div>
                    <h1 class="text-xl font-semibold m-0">Conferência de materiais</h1>
                    <p v-if="check" class="m-0 text-muted-color text-sm">{{ customerName ?? 'Remessa' }} · {{ check.shipments.length === 1 ? 'remessa' : 'remessas' }} {{ shipmentLabels }}</p>
                </div>
            </div>

            <div v-if="loading" class="card mb-0 flex flex-col gap-3">
                <Skeleton height="2rem" />
                <Skeleton v-for="n in 3" :key="n" height="4rem" />
            </div>

            <Message v-else-if="loadError" severity="error">
                <div class="flex flex-col gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" class="self-start" @click="load" />
                </div>
            </Message>

            <!-- Finished -->
            <div v-else-if="check.status === 'approved'" class="card mb-0 text-center flex flex-col items-center gap-3">
                <i class="pi pi-check-circle text-5xl text-green-500"></i>
                <h2 class="text-xl font-semibold m-0">Conferência concluída</h2>
                <p class="m-0 text-muted-color">Todos os materiais conferem com a remessa. Obrigado, {{ check.inspectorName }}.</p>
                <small class="text-muted-color">Concluída em {{ formatDateTime(check.finishedAt) }}</small>
            </div>

            <!-- Started on another phone -->
            <Message v-else-if="check.started && !check.mine" severity="warn"> Esta conferência foi iniciada em outro aparelho. Para continuar aqui, peça um novo QR Code ao encarregado. </Message>

            <!-- Not started: confirm the name -->
            <form v-else-if="!check.mine" class="card mb-0 flex flex-col gap-4" @submit.prevent="start">
                <p class="m-0">
                    Você vai conferir os materiais separados para o cliente. Para cada material aparece a quantidade esperada: conte e informe a quantidade encontrada. A conferência só pode ser concluída quando todas as quantidades baterem.
                </p>
                <div class="flex flex-col gap-2">
                    <label for="customer-name" class="font-medium">Seu nome completo</label>
                    <InputText id="customer-name" v-model="name" maxlength="255" autocomplete="name" :invalid="nameSubmitted && !name.trim()" fluid />
                    <small v-if="nameSubmitted && !name.trim()" class="text-red-500">Informe seu nome completo</small>
                </div>
                <Message v-if="startError" severity="error" size="small" variant="simple">{{ startError }}</Message>
                <Button type="submit" label="Iniciar conferência" icon="pi pi-play" :loading="starting" />
                <small class="text-muted-color text-center">Link válido até {{ formatDateTime(check.expiresAt) }}</small>
            </form>

            <!-- Counting -->
            <template v-else>
                <div class="card mb-0 flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-3">
                        <span class="font-medium">{{ matchedCount }} de {{ items.length }} materiais conferidos</span>
                        <span class="text-sm text-muted-color">{{ check.inspectorName }}</span>
                    </div>
                    <ProgressBar :value="items.length ? Math.round((matchedCount / items.length) * 100) : 0" :showValue="false" class="h-2" />
                    <div class="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                        <SelectButton v-model="itemFilter" :options="itemFilterOptions" optionLabel="label" optionValue="value" :allowEmpty="false" class="self-start" />
                        <IconField class="w-full sm:flex-1">
                            <InputIcon class="pi pi-search" />
                            <InputText v-model="search" type="search" placeholder="Buscar por descrição ou código" fluid />
                        </IconField>
                    </div>
                </div>

                <div v-if="!visibleItems.length" class="card mb-0 text-center text-muted-color">
                    {{ search.trim() ? 'Nenhum material encontrado.' : 'Todos os materiais conferem.' }}
                </div>

                <div v-for="item in visibleItems" :key="item.materialUuid" class="card mb-0 flex flex-col gap-3" :class="{ 'border-l-4 border-green-500': isConfirmed(item) }">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="font-semibold">{{ item.materialDescription }}</div>
                            <div class="text-sm text-muted-color">{{ item.materialCode }}</div>
                        </div>
                        <div class="text-right whitespace-nowrap">
                            <div class="text-xs text-muted-color">Esperado</div>
                            <div class="text-xl font-semibold">{{ qtyFormat.format(item.expectedQty) }}</div>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <label :for="`count-${item.materialUuid}`" class="text-sm font-medium">Quantidade contada</label>
                        <InputNumber
                            :modelValue="item.draftQty"
                            :inputId="`count-${item.materialUuid}`"
                            locale="pt-BR"
                            :maxFractionDigits="3"
                            :min="0"
                            inputmode="decimal"
                            :invalid="isDifferent(item)"
                            fluid
                            @update:modelValue="onQtyInput(item, $event)"
                        />
                    </div>
                    <small v-if="item.saveState === 'error'" class="text-red-500">{{ item.errorMessage }}</small>
                    <small v-else-if="isDifferent(item)" class="text-orange-600 dark:text-orange-400"> Diferente do esperado. Conte de novo; se faltar ou sobrar material, avise a Temec. </small>
                    <small v-else-if="isConfirmed(item)" class="text-green-600 dark:text-green-400"><i class="pi pi-check text-xs"></i> Confere</small>
                </div>

                <Message v-if="finishError" severity="error">{{ finishError }}</Message>
                <Button label="Concluir conferência" icon="pi pi-check" size="large" :disabled="!allMatch || pendingSaves" :loading="finishing" v-tooltip.top="allMatch ? null : 'Todas as quantidades precisam bater com a esperada'" @click="finish" />
            </template>

            <p class="text-center text-xs text-muted-color m-0">Temec · Confertec</p>
        </div>
    </div>
</template>
