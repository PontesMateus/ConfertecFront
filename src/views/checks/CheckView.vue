<script setup>
import { CheckService } from '@/service/CheckService';
import { session } from '@/service/session';
import { formatDateTime } from '@/utils/date';
import { useToast } from 'primevue/usetoast';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

// Waits for the checker to stop typing before saving a count
const SAVE_DELAY_MS = 600;

const props = defineProps({
    checkUuid: { type: String, required: true }
});

const router = useRouter();
const toast = useToast();

/**
 * Blind check: the API never sends the shipment or picked quantity, so this page cannot show them.
 * Items keep local edit state: draftQty (shown), countedQty (saved), saveState.
 */
const check = ref(null);
const items = ref([]);
const loading = ref(true);
const loadError = ref('');
const itemFilter = ref('all');
const itemFilterOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Não contados', value: 'pending' }
];

const finishVisible = ref(false);
const finishing = ref(false);
const finishError = ref('');
const finishForm = reactive({ customerInspection: false, companyPersonQty: 1, customerPersonQty: 0 });

const timers = new Map();
const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const shipment = computed(() => check.value?.shipment);
const label = computed(() => shipment.value && `${shipment.value.record}-${shipment.value.recordReceipt}`);
const editable = computed(() => check.value?.status === 'open' && check.value.userUuid === session.state.user?.uuid);
const countedCount = computed(() => items.value.filter((item) => item.countedQty !== null).length);
const progress = computed(() => (items.value.length ? Math.round((countedCount.value / items.value.length) * 100) : 0));
const pendingSaves = computed(() => items.value.some((item) => item.saveState === 'pending' || item.saveState === 'saving'));
const canFinish = computed(() => editable.value && items.value.length > 0 && countedCount.value === items.value.length && !pendingSaves.value);
const visibleItems = computed(() => (itemFilter.value === 'pending' ? items.value.filter((item) => item.countedQty === null || item.saveState !== 'saved') : items.value));

function applyCheck(value) {
    check.value = value;
    items.value = value.items.map((item) => ({ ...item, draftQty: item.countedQty, saveState: 'saved', errorMessage: '', seq: 0 }));
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        applyCheck(await CheckService.get(props.checkUuid));
        document.title = `Conferência ${label.value} | Confertec`;
    } catch (error) {
        loadError.value = error.message;
    } finally {
        loading.value = false;
    }
}

function onQtyInput(item, value) {
    item.draftQty = value;
    item.errorMessage = '';
    clearTimeout(timers.get(item.lineUuid));
    // Clearing the field leaves the last saved count; there is no "not counted" to go back to
    if (value === null) {
        item.saveState = 'saved';
        return;
    }
    item.saveState = 'pending';
    timers.set(
        item.lineUuid,
        setTimeout(() => save(item), SAVE_DELAY_MS)
    );
}

async function save(item) {
    timers.delete(item.lineUuid);
    const seq = ++item.seq;
    item.saveState = 'saving';
    try {
        const saved = await CheckService.setItemQty(props.checkUuid, item.lineUuid, item.draftQty);
        if (seq !== item.seq) return;
        Object.assign(item, { countedQty: saved.countedQty, saveState: 'saved' });
    } catch (error) {
        if (seq !== item.seq) return;
        Object.assign(item, { draftQty: item.countedQty, saveState: 'error', errorMessage: error.message });
    }
}

function flushPendingSaves() {
    for (const [lineUuid, timer] of timers) {
        clearTimeout(timer);
        const item = items.value.find((candidate) => candidate.lineUuid === lineUuid);
        if (item) save(item);
    }
}

function openFinish() {
    finishForm.customerInspection = check.value.customerInspection;
    finishForm.companyPersonQty = check.value.companyPersonQty;
    finishForm.customerPersonQty = check.value.customerPersonQty;
    finishError.value = '';
    finishVisible.value = true;
}

async function finish() {
    finishing.value = true;
    finishError.value = '';
    try {
        applyCheck(
            await CheckService.finish(props.checkUuid, {
                customerInspection: finishForm.customerInspection,
                companyPersonQty: finishForm.companyPersonQty ?? 1,
                customerPersonQty: finishForm.customerPersonQty ?? 0
            })
        );
        finishVisible.value = false;
        if (check.value.result.approved) {
            toast.add({ severity: 'success', summary: 'Conferência aprovada', detail: `Remessa ${label.value}`, life: 4000 });
        } else {
            toast.add({ severity: 'warn', summary: 'Conferência reprovada', detail: `Remessa ${label.value}: o administrador foi avisado`, life: 6000 });
        }
    } catch (error) {
        finishError.value = error.message;
    } finally {
        finishing.value = false;
    }
}

watch(() => props.checkUuid, load, { immediate: true });
onBeforeUnmount(flushPendingSaves);
</script>

<template>
    <div class="flex flex-col gap-6">
        <div class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <Button icon="pi pi-arrow-left" severity="secondary" text rounded aria-label="Voltar" v-tooltip.bottom="'Voltar para a lista'" @click="router.push({ name: 'home' })" />
                    <div>
                        <h1 class="text-2xl font-semibold m-0">
                            Conferência <span v-if="label">{{ label }}</span>
                        </h1>
                        <div v-if="check" class="flex flex-wrap items-center gap-2 mt-1 text-muted-color">
                            <Tag v-if="check.status === 'open'" value="Em andamento" severity="info" />
                            <Tag v-else-if="check.status === 'approved'" value="Aprovada" severity="success" />
                            <Tag v-else value="Reprovada" severity="danger" />
                            <span>Conferente: {{ check.userName }}</span>
                            <span>·</span>
                            <span>Iniciada em {{ formatDateTime(check.createdAt) }}</span>
                        </div>
                    </div>
                </div>
                <Button v-if="editable" label="Finalizar conferência" icon="pi pi-check" :disabled="!canFinish" v-tooltip.bottom="canFinish ? null : 'Conte todos os itens para finalizar'" @click="openFinish" />
            </div>

            <Message v-if="loadError" severity="error" class="mt-4">
                <div class="flex flex-wrap items-center gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" @click="load" />
                </div>
            </Message>

            <div v-if="loading && !check" class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <Skeleton v-for="n in 4" :key="n" height="2.75rem" />
            </div>

            <template v-else-if="check">
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

                <template v-if="check.status === 'open'">
                    <div class="mt-6">
                        <div class="flex justify-between text-sm mb-2">
                            <span class="font-medium">{{ countedCount }} de {{ items.length }} itens contados</span>
                            <span class="text-muted-color">{{ progress }}%</span>
                        </div>
                        <ProgressBar :value="progress" :showValue="false" class="h-2" />
                    </div>
                    <Message v-if="editable" severity="secondary" class="mt-4"> <i class="pi pi-eye-slash mr-2"></i>Conferência cega: conte cada item e informe a quantidade encontrada. A quantidade da remessa só é comparada ao finalizar. </Message>
                    <Message v-else severity="info" class="mt-4">Esta conferência é de {{ check.userName }}; só o responsável pode alterá-la.</Message>
                </template>

                <Message v-else-if="check.result.approved" severity="success" class="mt-6"> <strong>Conferência aprovada.</strong> Todas as quantidades contadas conferem com a remessa. Finalizada em {{ formatDateTime(check.finishedAt) }}. </Message>
                <Message v-else severity="error" class="mt-6">
                    <div class="flex flex-col gap-1">
                        <strong>Conferência reprovada.</strong>
                        <span>
                            {{ check.result.divergentMaterialCodes.length === 1 ? 'Divergência em' : `Divergências em ${check.result.divergentMaterialCodes.length} itens:` }}
                            {{ check.result.divergentMaterialCodes.join(', ') }}. O administrador foi avisado e a separação fica disponível para uma nova conferência.
                        </span>
                    </div>
                </Message>
            </template>
        </div>

        <div v-if="check" class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 class="text-xl font-semibold m-0">Itens</h2>
                <SelectButton v-if="check.status === 'open'" v-model="itemFilter" :options="itemFilterOptions" optionLabel="label" optionValue="value" :allowEmpty="false" />
            </div>

            <DataTable :value="visibleItems" dataKey="lineUuid" sortField="materialDescription" :sortOrder="1" stripedRows>
                <template #empty>
                    <div class="py-6 text-center text-muted-color">{{ itemFilter === 'pending' ? 'Todos os itens foram contados.' : 'Esta conferência não tem itens.' }}</div>
                </template>
                <Column field="materialCode" header="Código" sortable class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.materialCode }}</span>
                        <Tag v-if="check.result && check.result.divergentMaterialCodes.includes(data.materialCode)" value="Divergente" severity="danger" class="ml-2" />
                    </template>
                </Column>
                <Column field="materialDescription" header="Descrição" sortable />
                <Column header="Contado" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2">
                                <InputNumber
                                    v-if="editable"
                                    :modelValue="data.draftQty"
                                    :min="0"
                                    :maxFractionDigits="3"
                                    locale="pt-BR"
                                    showButtons
                                    buttonLayout="horizontal"
                                    placeholder="—"
                                    :inputStyle="{ width: '5.5rem', textAlign: 'center' }"
                                    :aria-label="`Quantidade contada de ${data.materialCode}`"
                                    @update:modelValue="onQtyInput(data, $event)"
                                >
                                    <template #incrementicon><span class="pi pi-plus" /></template>
                                    <template #decrementicon><span class="pi pi-minus" /></template>
                                </InputNumber>
                                <span v-else class="font-medium">{{ data.countedQty === null ? '—' : qtyFormat.format(data.countedQty) }}</span>

                                <i v-if="data.saveState === 'saving' || data.saveState === 'pending'" class="pi pi-spin pi-spinner text-muted-color" aria-label="Salvando"></i>
                                <i v-else-if="data.saveState === 'error'" class="pi pi-times-circle text-red-500" aria-label="Não salvo"></i>
                                <!-- Only "counted", never "matches": the check is blind -->
                                <i v-else-if="data.countedQty !== null && check.status === 'open'" class="pi pi-check text-muted-color" aria-label="Contado"></i>
                            </div>
                            <small v-if="data.saveState === 'error'" class="text-red-500 whitespace-normal">{{ data.errorMessage }}</small>
                        </div>
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <Dialog v-model:visible="finishVisible" header="Finalizar conferência" modal :closable="!finishing" :style="{ width: '30rem' }" :breakpoints="{ '575px': '95vw' }">
        <form id="finish-check-form" class="flex flex-col gap-5" @submit.prevent="finish">
            <Message severity="warn" size="small">Depois de finalizar não é possível recontar. As quantidades contadas serão comparadas com a remessa.</Message>

            <div class="flex items-center justify-between gap-4">
                <label for="check-inspection" class="font-medium">Cliente acompanhou a conferência</label>
                <ToggleSwitch inputId="check-inspection" v-model="finishForm.customerInspection" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                    <label for="check-company" class="font-medium">Pessoas da Temec</label>
                    <InputNumber inputId="check-company" v-model="finishForm.companyPersonQty" :min="1" :max="99" showButtons fluid />
                </div>
                <div class="flex flex-col gap-2">
                    <label for="check-customer" class="font-medium">Pessoas do cliente</label>
                    <InputNumber inputId="check-customer" v-model="finishForm.customerPersonQty" :min="0" :max="99" showButtons fluid />
                </div>
            </div>

            <Message v-if="finishError" severity="error" size="small" variant="simple">{{ finishError }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text :disabled="finishing" @click="finishVisible = false" />
            <Button type="submit" form="finish-check-form" label="Finalizar" icon="pi pi-check" :loading="finishing" />
        </template>
    </Dialog>
</template>
