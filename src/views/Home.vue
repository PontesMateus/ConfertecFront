<script setup>
import { USER_TYPE } from '@/constants/userType';
import { session } from '@/service/session';
import AssignmentBoard from '@/views/assignments/AssignmentBoard.vue';
import CheckQueue from '@/views/checks/CheckQueue.vue';
import RejectedCheckList from '@/views/checks/RejectedCheckList.vue';
import PickingIssueList from '@/views/issues/PickingIssueList.vue';
import PickingQueue from '@/views/pickings/PickingQueue.vue';
import { computed } from 'vue';

const firstName = computed(() => session.state.user?.name?.split(' ')[0] ?? '');
const isOperator = computed(() => session.hasUserType([USER_TYPE.OPERATOR]));
const isSupervisor = computed(() => session.hasUserType([USER_TYPE.SUPERVISOR]));
const isAdministrator = computed(() => session.hasUserType([USER_TYPE.ADMINISTRATOR]));
</script>

<template>
    <!-- A Conferente picks and checks: both queues, each with only what is assigned to them -->
    <div v-if="isOperator" class="flex flex-col gap-6">
        <PickingQueue />
        <CheckQueue />
    </div>
    <div v-else-if="isSupervisor" class="flex flex-col gap-6">
        <AssignmentBoard />
        <RejectedCheckList />
    </div>
    <template v-else-if="isAdministrator">
        <PickingIssueList />
        <RejectedCheckList />
    </template>
    <div v-else class="card">
        <h1 class="text-2xl font-semibold mb-2">Olá{{ firstName ? `, ${firstName}` : '' }}</h1>
        <p class="text-muted-color m-0">Separação e conferência de remessas importadas do Sisloc.</p>
    </div>
</template>
