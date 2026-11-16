<script setup>
import { formatDateTime } from '@/utils/date';
import { computed } from 'vue';

/**
 * When each picking and check started and finished, and who did it.
 * `pickings`: { uuid, label?, startedAt, finishedAt, userName }; `checks`: the API's checks, newest first.
 */
const props = defineProps({
    pickings: { type: Array, required: true },
    checks: { type: Array, required: true }
});

const CHECK_RESULT = {
    approved: { label: 'Aprovada', severity: 'success' },
    rejected: { label: 'Com divergência', severity: 'danger' }
};

const rows = computed(() => [
    ...props.pickings.map((picking) => ({
        key: picking.uuid,
        stage: 'Separação',
        detail: picking.label ?? null,
        startedAt: picking.startedAt,
        finishedAt: picking.finishedAt,
        userName: picking.userName,
        result: null,
        byCustomer: false
    })),
    // Oldest first: the first check, then each recount
    ...[...props.checks].reverse().map((check, index) => ({
        key: check.uuid,
        stage: index ? `Recontagem ${index}` : 'Conferência',
        detail: null,
        startedAt: check.createdAt,
        finishedAt: check.finishedAt,
        userName: check.userName,
        result: CHECK_RESULT[check.status] ?? null,
        byCustomer: check.byCustomer
    }))
]);
</script>

<template>
    <div class="card mb-0">
        <h2 class="text-xl font-semibold m-0 mb-4">Andamento</h2>
        <DataTable :value="rows" dataKey="key" stripedRows size="small">
            <template #empty>
                <div class="py-6 text-center text-muted-color">Separação ainda não atribuída.</div>
            </template>
            <Column header="Etapa" class="whitespace-nowrap">
                <template #body="{ data }">
                    <span class="font-medium">{{ data.stage }}</span>
                    <span v-if="data.detail" class="text-muted-color"> · {{ data.detail }}</span>
                    <Tag v-if="data.result" :value="data.result.label" :severity="data.result.severity" class="ml-2" />
                </template>
            </Column>
            <Column header="Iniciada em" class="whitespace-nowrap">
                <template #body="{ data }">
                    <span v-if="data.startedAt">{{ formatDateTime(data.startedAt) }}</span>
                    <span v-else class="text-muted-color">Não iniciada</span>
                </template>
            </Column>
            <Column header="Finalizada em" class="whitespace-nowrap">
                <template #body="{ data }">
                    <span v-if="data.finishedAt">{{ formatDateTime(data.finishedAt) }}</span>
                    <span v-else-if="data.startedAt" class="text-muted-color">Em andamento</span>
                    <span v-else class="text-muted-color">—</span>
                </template>
            </Column>
            <Column header="Feita por">
                <template #body="{ data }">
                    {{ data.userName }}
                    <Tag v-if="data.byCustomer" value="Inspetor do cliente" icon="pi pi-qrcode" severity="secondary" class="ml-2" />
                </template>
            </Column>
        </DataTable>
    </div>
</template>
