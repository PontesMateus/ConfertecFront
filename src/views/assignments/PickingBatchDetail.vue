<script setup>
import { ASSIGNMENT_ROLE } from '@/constants/pickingBatchAssignmentRole';
import { PICKING_STATUS, PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
import { CheckService } from '@/service/CheckService';
import { PickingBatchService } from '@/service/PickingBatchService';
import { UserService } from '@/service/UserService';
import { realtime, useRealtimeRefresh } from '@/service/realtime';
import { formatDateTime } from '@/utils/date';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import CustomerCheckQrDialog from '@/views/customer-check/CustomerCheckQrDialog.vue';
import PhotoListButton from '@/views/photos/PhotoListButton.vue';
import WorkTimesTable from './WorkTimesTable.vue';
import AssignUserDialog from './AssignUserDialog.vue';
import PickingBatchAddShipmentDialog from './PickingBatchAddShipmentDialog.vue';

/** Encarregado and Administrador: one batch, its people, its shipments and the history of assignments */
const props = defineProps({
    batchUuid: { type: String, required: true }
});

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const batch = ref(null);
/** Checks of this batch, newest first */
const checks = ref([]);
const users = ref([]);
const loading = ref(true);
const loadError = ref('');
const assignVisible = ref(false);
const assignRole = ref(ASSIGNMENT_ROLE.PICKER);
const addVisible = ref(false);
const removingUuid = ref(null);
const qrVisible = ref(false);
const customerLink = ref(null);
const regenerating = ref(false);
const canceling = ref(false);
const releaseVisible = ref(false);
const releasing = ref(false);
const releaseError = ref('');
const releaseName = ref('');

const title = computed(() => batch.value?.pickings.map((picking) => shipmentLabel(picking.shipment)).join(', '));
const openCheck = computed(() => checks.value.find((check) => check.status === 'open') ?? null);
/** Once a check started, the batch keeps its shipments: a recount must cover the same ones */
const hasCheck = computed(() => checks.value.length > 0);
const pickingOpen = computed(() => batch.value?.pickings.some((picking) => [PICKING_STATUS.PENDING, PICKING_STATUS.IN_PROGRESS].includes(picking.statusId)));
const approved = computed(() => batch.value?.pickings.every((picking) => picking.statusId === PICKING_STATUS.CHECKED));
/** The customer's inspector is checking instead of the checker (through a QR Code) */
const customerCheck = computed(() => (openCheck.value?.byCustomer ? openCheck.value : null));
// A customer check stays with the customer: changing the checker meanwhile needs no justification
const assignStarted = computed(() => (assignRole.value === ASSIGNMENT_ROLE.PICKER ? batch.value?.started : Boolean(openCheck.value && !customerCheck.value)));
/**
 * Every picking finished, no check open and one customer: the customer's inspector can check instead of the checker
 * (the API checks it too)
 */
const canReleaseCustomerCheck = computed(() => {
    const pickings = batch.value?.pickings ?? [];
    const customers = new Set(pickings.map((picking) => picking.shipment.customer?.trim() || null));
    return pickings.length > 0 && pickings.every((picking) => picking.statusId === PICKING_STATUS.DONE) && !openCheck.value && customers.size === 1 && !customers.has(null);
});
const linkExpired = computed(() => customerCheck.value && new Date(customerCheck.value.customerLink.expiresAt) < new Date());

/**
 * Materials of the batch's current revisions, one row per material: quantity summed over every shipment, and the
 * material's photos (shared by every shipment of the batch, oldest first)
 */
const batchItems = computed(() => {
    const byMaterial = new Map();
    for (const item of batch.value?.pickings.flatMap((picking) => picking.items) ?? []) {
        const row = byMaterial.get(item.materialUuid);
        if (row) {
            row.qty = Math.round((row.qty + item.requiredQty) * 1000) / 1000;
            if (item.replacedMaterialCode && !row.replacedMaterialCodes.includes(item.replacedMaterialCode)) row.replacedMaterialCodes.push(item.replacedMaterialCode);
        } else {
            byMaterial.set(item.materialUuid, {
                materialUuid: item.materialUuid,
                materialCode: item.materialCode,
                materialDescription: item.materialDescription,
                qty: item.requiredQty,
                replacedMaterialCodes: item.replacedMaterialCode ? [item.replacedMaterialCode] : [],
                photoUuids: item.photoUuids
            });
        }
    }
    return [...byMaterial.values()];
});
const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const CHECK_STATUS = {
    open: { label: 'Em andamento', severity: 'info' },
    approved: { label: 'Aprovada', severity: 'success' },
    rejected: { label: 'Com divergência', severity: 'danger' }
};

function shipmentLabel(shipment) {
    return `${shipment.record}-${shipment.recordReceipt}`;
}

function doneCount(picking) {
    return picking.items.filter((item) => item.done).length;
}

function openIssueCount(picking) {
    return picking.issues.filter((issue) => issue.open).length;
}

let loadSeq = 0;

/** `silent`: a refetch pushed by the server, without the loading state; a failure keeps the current page. */
async function load({ silent = false } = {}) {
    const seq = ++loadSeq;
    if (!silent) {
        loading.value = true;
        loadError.value = '';
    }
    try {
        const [value, assignable] = await Promise.all([PickingBatchService.get(props.batchUuid), users.value.length ? users.value : UserService.listAssignable()]);
        // Every check of the batch covers all of its shipments, so the first shipment's history has them all
        const firstShipment = value.pickings[0]?.shipment;
        const shipmentChecks = firstShipment ? await CheckService.listByShipment(firstShipment.uuid) : [];
        if (seq !== loadSeq) return;
        batch.value = value;
        users.value = assignable;
        checks.value = shipmentChecks.filter((check) => check.batchUuid === value.uuid);
        loadError.value = '';
        document.title = `Grupo ${title.value} | Confertec`;
    } catch (error) {
        if (!silent && seq === loadSeq) loadError.value = error.message;
    } finally {
        if (seq === loadSeq) loading.value = false;
    }
}

// The picker started or finished, an issue changed, a check started or finished
useRealtimeRefresh('pickingQueue.changed', () => load({ silent: true }));
useRealtimeRefresh('checkQueue.changed', () => load({ silent: true }));
const unsubscribe = realtime.subscribe('pickingBatch.changed', (message) => {
    if (message.reconnected || message.batchUuid === props.batchUuid) load({ silent: true });
});
onBeforeUnmount(unsubscribe);

function openAssign(role) {
    assignRole.value = role;
    assignVisible.value = true;
}

function onAssigned(value, { swapped } = {}) {
    batch.value = value;
    if (swapped) {
        toast.add({ severity: 'success', summary: 'Funções trocadas', detail: `Separador: ${value.userName} · Conferente: ${value.checker.name}`, life: 4000 });
        load({ silent: true });
        return;
    }
    const name = assignRole.value === ASSIGNMENT_ROLE.PICKER ? value.userName : value.checker.name;
    toast.add({ severity: 'success', summary: assignRole.value === ASSIGNMENT_ROLE.PICKER ? 'Separador alterado' : 'Conferente atribuído', detail: name, life: 4000 });
    load({ silent: true });
}

function onShipmentAdded(value) {
    batch.value = value;
    toast.add({ severity: 'success', summary: 'Remessa adicionada ao grupo', life: 3000 });
}

function confirmRemove(picking) {
    const label = shipmentLabel(picking.shipment);
    const pending = picking.statusId === PICKING_STATUS.PENDING;
    confirm.require({
        header: 'Retirar remessa do grupo',
        message: pending
            ? `A remessa ${label} volta para as remessas sem atribuição. Deseja continuar?`
            : `A separação da remessa ${label} já começou: ela sai deste grupo e continua num grupo próprio, com o mesmo separador e conferente e o que já foi separado. Deseja continuar?`,
        icon: 'pi pi-sign-out',
        rejectProps: { label: 'Cancelar', severity: 'secondary', text: true },
        acceptProps: { label: 'Retirar remessa', severity: 'warn' },
        accept: () => remove(picking, label)
    });
}

async function remove(picking, label) {
    removingUuid.value = picking.uuid;
    try {
        const result = await PickingBatchService.removePicking(props.batchUuid, picking.uuid);
        toast.add({ severity: 'success', summary: 'Remessa retirada do grupo', detail: label, life: 3000 });
        if (result.deleted) {
            router.push({ name: 'assignments' });
            return;
        }
        batch.value = result;
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível retirar', detail: error.message, life: 5000 });
    } finally {
        removingUuid.value = null;
    }
}

function openRelease() {
    // Pre-filled with whoever followed the picking, when someone did; the inspector confirms it when opening the link
    releaseName.value = [...(batch.value?.pickings ?? [])].reverse().find((picking) => picking.customerInspectorName)?.customerInspectorName ?? '';
    releaseError.value = '';
    releaseVisible.value = true;
}

async function releaseCustomerCheck() {
    releasing.value = true;
    releaseError.value = '';
    try {
        customerLink.value = await PickingBatchService.releaseCustomerCheck(props.batchUuid, releaseName.value.trim());
        releaseVisible.value = false;
        qrVisible.value = true;
        load({ silent: true });
    } catch (error) {
        releaseError.value = error.message;
    } finally {
        releasing.value = false;
    }
}

async function regenerateLink() {
    regenerating.value = true;
    try {
        customerLink.value = await CheckService.regenerateCustomerLink(customerCheck.value.uuid);
        qrVisible.value = true;
        load({ silent: true });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível gerar o QR Code', detail: error.message, life: 5000 });
    } finally {
        regenerating.value = false;
    }
}

function confirmCancelCustomerCheck() {
    confirm.require({
        header: 'Cancelar conferência pelo cliente',
        message: `A conferência de ${customerCheck.value.userName} é descartada, com o que já foi contado, e o grupo vai para a fila do conferente${batch.value.checker ? ` (${batch.value.checker.name})` : ''}. Deseja continuar?`,
        icon: 'pi pi-times-circle',
        rejectProps: { label: 'Voltar', severity: 'secondary', text: true },
        acceptProps: { label: 'Cancelar conferência', severity: 'danger' },
        accept: cancelCustomerCheck
    });
}

async function cancelCustomerCheck() {
    canceling.value = true;
    try {
        await CheckService.cancelCustomerCheck(customerCheck.value.uuid);
        toast.add({ severity: 'success', summary: 'Conferência pelo cliente cancelada', life: 4000 });
        load({ silent: true });
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Não foi possível cancelar', detail: error.message, life: 5000 });
    } finally {
        canceling.value = false;
    }
}

watch(
    () => props.batchUuid,
    () => load(),
    { immediate: true }
);
</script>

<template>
    <div class="flex flex-col gap-6">
        <div class="card mb-0">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <Button icon="pi pi-arrow-left" severity="secondary" text rounded aria-label="Voltar" v-tooltip.bottom="'Voltar para as atribuições'" @click="router.push({ name: 'assignments' })" />
                    <div>
                        <h1 class="text-2xl font-semibold m-0">
                            Grupo <span v-if="title">{{ title }}</span>
                        </h1>
                        <div v-if="batch" class="text-muted-color mt-1">Atribuído em {{ formatDateTime(batch.createdAt) }}</div>
                    </div>
                </div>
                <div v-if="batch" class="flex gap-2">
                    <Button icon="pi pi-refresh" severity="secondary" outlined aria-label="Atualizar" v-tooltip.bottom="'Atualizar'" @click="load()" />
                    <Button label="Adicionar remessa" icon="pi pi-plus" severity="secondary" :disabled="hasCheck" v-tooltip.bottom="hasCheck ? 'A conferência já começou: o grupo não muda mais' : null" @click="addVisible = true" />
                </div>
            </div>

            <Message v-if="loadError" severity="error" class="mt-4">
                <div class="flex flex-wrap items-center gap-3">
                    <span>{{ loadError }}</span>
                    <Button label="Tentar novamente" size="small" severity="secondary" @click="load()" />
                </div>
            </Message>

            <div v-if="loading && !batch" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <Skeleton v-for="n in 2" :key="n" height="5rem" />
            </div>

            <div v-else-if="batch" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div class="border border-surface rounded-border p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div class="text-sm text-muted-color">Separador</div>
                        <div class="font-medium text-lg">{{ batch.userName }}</div>
                        <div class="text-xs text-muted-color">{{ batch.started ? 'Separação iniciada' : 'Ainda não iniciou' }}</div>
                    </div>
                    <Button
                        label="Trocar"
                        icon="pi pi-user-edit"
                        size="small"
                        severity="secondary"
                        outlined
                        :disabled="!pickingOpen"
                        v-tooltip.bottom="pickingOpen ? null : 'A separação já foi concluída'"
                        @click="openAssign(ASSIGNMENT_ROLE.PICKER)"
                    />
                </div>
                <div class="border border-surface rounded-border p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div class="text-sm text-muted-color">Conferente</div>
                        <div v-if="batch.checker" class="font-medium text-lg">{{ batch.checker.name }}</div>
                        <Tag v-else value="Sem conferente" icon="pi pi-exclamation-triangle" severity="warn" class="mt-1" />
                        <div class="text-xs text-muted-color">
                            <template v-if="customerCheck">O cliente está conferindo no lugar do conferente</template>
                            <template v-else-if="openCheck">Conferência em andamento · {{ openCheck.countedCount }} de {{ openCheck.itemCount }} itens contados</template>
                            <template v-else-if="checks[0]">Última conferência: {{ CHECK_STATUS[checks[0].status].label.toLowerCase() }}</template>
                            <template v-else>Conferência não iniciada</template>
                        </div>
                    </div>
                    <Button
                        :label="batch.checker ? 'Trocar' : 'Atribuir'"
                        icon="pi pi-user-edit"
                        size="small"
                        :severity="batch.checker ? 'secondary' : undefined"
                        :outlined="Boolean(batch.checker)"
                        :disabled="approved"
                        v-tooltip.bottom="approved ? 'A conferência já foi aprovada' : null"
                        @click="openAssign(ASSIGNMENT_ROLE.CHECKER)"
                    />
                </div>
            </div>

            <Message v-if="canReleaseCustomerCheck" severity="secondary" class="mt-4">
                <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                    <span class="text-sm">Separação concluída. O inspetor do cliente pode conferir no lugar do conferente, pelo celular, lendo um QR Code.</span>
                    <Button label="Conferência pelo cliente" icon="pi pi-qrcode" size="small" @click="openRelease" />
                </div>
            </Message>

            <Message v-if="customerCheck" :severity="linkExpired ? 'warn' : 'info'" class="mt-4">
                <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                    <div class="flex flex-col gap-1">
                        <span class="font-medium">Conferência pelo cliente: {{ customerCheck.userName }}</span>
                        <span class="text-sm">
                            {{ customerCheck.customerLink.started ? `Iniciada · ${customerCheck.countedCount} de ${customerCheck.itemCount} materiais contados` : 'Aguardando o inspetor ler o QR Code' }}
                            · {{ linkExpired ? 'link expirado em' : 'link válido até' }} {{ formatDateTime(customerCheck.customerLink.expiresAt) }}
                        </span>
                    </div>
                    <div class="flex gap-2">
                        <Button label="Novo QR Code" icon="pi pi-qrcode" size="small" :loading="regenerating" v-tooltip.bottom="'O link anterior deixa de funcionar; o que já foi contado é mantido'" @click="regenerateLink" />
                        <Button label="Cancelar" icon="pi pi-times" size="small" severity="danger" outlined :loading="canceling" v-tooltip.bottom="'O grupo volta para o conferente'" @click="confirmCancelCustomerCheck" />
                    </div>
                </div>
            </Message>
        </div>

        <div v-if="batch" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Remessas</h2>
            <DataTable :value="batch.pickings" dataKey="uuid" stripedRows>
                <Column header="Remessa" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ shipmentLabel(data.shipment) }}</span>
                        <div class="text-xs text-muted-color">Revisão {{ data.shipment.revisionNumber }}</div>
                    </template>
                </Column>
                <Column header="Saída" class="whitespace-nowrap">
                    <template #body="{ data }">{{ formatDateTime(data.shipment.shippingAt) }}</template>
                </Column>
                <Column header="Cliente">
                    <template #body="{ data }">{{ data.shipment.customer ?? '—' }}</template>
                </Column>
                <Column header="Separação" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <div class="flex flex-col gap-1 min-w-36">
                            <Tag :value="data.status" :severity="PICKING_STATUS_SEVERITY[data.statusId]" class="self-start" />
                            <ProgressBar :value="data.items.length ? Math.round((doneCount(data) / data.items.length) * 100) : 0" :showValue="false" class="h-1.5" />
                            <span class="text-xs text-muted-color">{{ doneCount(data) }} de {{ data.items.length }} itens completos</span>
                            <Tag v-if="openIssueCount(data)" :value="openIssueCount(data) === 1 ? '1 falta pendente' : `${openIssueCount(data)} faltas pendentes`" icon="pi pi-exclamation-triangle" severity="warn" class="self-start" />
                        </div>
                    </template>
                </Column>
                <Column header="" class="w-0 whitespace-nowrap">
                    <template #body="{ data }">
                        <Button
                            icon="pi pi-sign-out"
                            severity="secondary"
                            text
                            rounded
                            :aria-label="`Retirar a remessa ${shipmentLabel(data.shipment)} do grupo`"
                            v-tooltip.left="hasCheck ? 'A conferência já começou: o grupo não muda mais' : 'Retirar remessa do grupo'"
                            :disabled="hasCheck"
                            :loading="removingUuid === data.uuid"
                            @click="confirmRemove(data)"
                        />
                    </template>
                </Column>
            </DataTable>
        </div>

        <WorkTimesTable v-if="batch" :pickings="batch.pickings.map((picking) => ({ ...picking, label: shipmentLabel(picking.shipment) }))" :checks="checks" />

        <div v-if="batch" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Itens da revisão atual</h2>
            <DataTable :value="batchItems" dataKey="materialUuid" sortField="materialDescription" :sortOrder="1" stripedRows size="small">
                <template #empty>
                    <div class="py-6 text-center text-muted-color">As remessas do grupo não têm itens.</div>
                </template>
                <Column field="materialCode" header="Código" sortable class="whitespace-nowrap">
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.materialCode }}</span>
                        <Tag v-for="code in data.replacedMaterialCodes" :key="code" :value="`Substitui ${code}`" icon="pi pi-arrow-right-arrow-left" severity="info" class="ml-2" />
                    </template>
                </Column>
                <Column field="materialDescription" header="Descrição" sortable />
                <Column field="qty" header="Quantidade" sortable class="text-right whitespace-nowrap">
                    <template #body="{ data }">{{ qtyFormat.format(data.qty) }}</template>
                </Column>
                <Column v-if="batchItems.some((item) => item.photoUuids.length)" header="Fotos da separação">
                    <template #body="{ data }">
                        <PhotoListButton v-if="data.photoUuids.length" :photoUuids="data.photoUuids" :title="`Fotos de ${data.materialCode} separado`" :altPrefix="`Foto de ${data.materialCode} separado`" />
                        <span v-else class="text-muted-color">—</span>
                    </template>
                </Column>
            </DataTable>
        </div>

        <div v-if="batch" class="card mb-0">
            <h2 class="text-xl font-semibold m-0 mb-4">Histórico de atribuições</h2>
            <DataTable :value="[...batch.assignments].reverse()" stripedRows>
                <template #empty>
                    <div class="py-6 text-center text-muted-color">Nenhuma atribuição registrada.</div>
                </template>
                <Column header="Data" class="whitespace-nowrap">
                    <template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template>
                </Column>
                <Column header="Função" class="whitespace-nowrap">
                    <template #body="{ data }">
                        <Tag :value="data.roleLabel" :severity="data.roleId === ASSIGNMENT_ROLE.PICKER ? 'info' : 'secondary'" />
                    </template>
                </Column>
                <Column header="Responsável" field="userName" />
                <Column header="Atribuído por">
                    <template #body="{ data }">{{ data.assignerName ?? '—' }}</template>
                </Column>
                <Column header="Justificativa">
                    <template #body="{ data }">
                        <span v-if="data.justification" class="whitespace-pre-line">{{ data.justification }}</span>
                        <span v-else class="text-muted-color">—</span>
                    </template>
                </Column>
            </DataTable>
        </div>

        <AssignUserDialog v-model:visible="assignVisible" :batch="batch" :role="assignRole" :users="users" :started="assignStarted" @saved="onAssigned" />
        <PickingBatchAddShipmentDialog v-model:visible="addVisible" :batch="batch" @added="onShipmentAdded" />
        <CustomerCheckQrDialog v-model:visible="qrVisible" :link="customerLink" />

        <Dialog v-model:visible="releaseVisible" header="Conferência pelo cliente" modal :style="{ width: '30rem' }" :breakpoints="{ '575px': '95vw' }">
            <form id="release-form" class="flex flex-col gap-4" @submit.prevent="releaseCustomerCheck">
                <p class="m-0 text-muted-color">
                    O inspetor do cliente confere {{ batch?.pickings.length > 1 ? 'todas as remessas do grupo' : 'a remessa' }} no lugar do conferente, vendo as quantidades esperadas. A conferência só termina quando todas as contagens baterem.
                </p>
                <div class="flex flex-col gap-2">
                    <label for="release-inspector" class="font-medium">Inspetor do cliente <span class="text-muted-color font-normal">(opcional)</span></label>
                    <InputText id="release-inspector" v-model="releaseName" maxlength="255" placeholder="Nome de quem vai conferir" fluid />
                    <small class="text-muted-color">O inspetor confirma o nome ao abrir o link.</small>
                </div>
                <Message v-if="releaseError" severity="error" size="small" variant="simple">{{ releaseError }}</Message>
            </form>
            <template #footer>
                <Button label="Cancelar" severity="secondary" text :disabled="releasing" @click="releaseVisible = false" />
                <Button type="submit" form="release-form" label="Gerar QR Code" icon="pi pi-qrcode" :loading="releasing" />
            </template>
        </Dialog>
    </div>
</template>
