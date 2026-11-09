<script setup>
import { PICKING_STATUS_SEVERITY } from '@/constants/pickingStatus';
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
const assignRole = ref('PICKER');
const addVisible = ref(false);
const removingUuid = ref(null);
const qrVisible = ref(false);
const customerLink = ref(null);
const regenerating = ref(false);
const canceling = ref(false);

const title = computed(() => batch.value?.pickings.map((picking) => shipmentLabel(picking.shipment)).join(', '));
const openCheck = computed(() => checks.value.find((check) => check.status === 'open') ?? null);
/** Once a check started, the batch keeps its shipments: a recount must cover the same ones */
const hasCheck = computed(() => checks.value.length > 0);
const pickingOpen = computed(() => batch.value?.pickings.some((picking) => picking.status === 'Pendente' || picking.status === 'Em andamento'));
const approved = computed(() => batch.value?.pickings.every((picking) => picking.status === 'Conferida'));
/** The customer's inspector is checking instead of the checker (through a QR Code) */
const customerCheck = computed(() => (openCheck.value?.byCustomer ? openCheck.value : null));
// A customer check stays with the customer: changing the checker meanwhile needs no justification
const assignStarted = computed(() => (assignRole.value === 'PICKER' ? batch.value?.started : Boolean(openCheck.value && !customerCheck.value)));
const linkExpired = computed(() => customerCheck.value && new Date(customerCheck.value.customerLink.expiresAt) < new Date());

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

function onAssigned(value) {
    batch.value = value;
    const name = assignRole.value === 'PICKER' ? value.userName : value.checker.name;
    toast.add({ severity: 'success', summary: assignRole.value === 'PICKER' ? 'Separador alterado' : 'Conferente atribuído', detail: name, life: 4000 });
    load({ silent: true });
}

function onShipmentAdded(value) {
    batch.value = value;
    toast.add({ severity: 'success', summary: 'Remessa adicionada ao grupo', life: 3000 });
}

function confirmRemove(picking) {
    const label = shipmentLabel(picking.shipment);
    const pending = picking.status === 'Pendente';
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
                    <Button label="Trocar" icon="pi pi-user-edit" size="small" severity="secondary" outlined :disabled="!pickingOpen" v-tooltip.bottom="pickingOpen ? null : 'A separação já foi concluída'" @click="openAssign('PICKER')" />
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
                        @click="openAssign('CHECKER')"
                    />
                </div>
            </div>

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
                            <Tag :value="data.status" :severity="PICKING_STATUS_SEVERITY[data.status]" class="self-start" />
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
                        <Tag :value="data.roleLabel" :severity="data.role === 'PICKER' ? 'info' : 'secondary'" />
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
    </div>
</template>
