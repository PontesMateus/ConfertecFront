<script setup>
import { USER_TYPE } from '@/constants/userType';
import { session } from '@/service/session';
import CheckQueue from '@/views/checks/CheckQueue.vue';
import RejectedCheckList from '@/views/checks/RejectedCheckList.vue';
import PickingIssueList from '@/views/issues/PickingIssueList.vue';
import PickingQueue from '@/views/pickings/PickingQueue.vue';
import { computed } from 'vue';

const firstName = computed(() => session.state.user?.name?.split(' ')[0] ?? '');
const isPicker = computed(() => session.hasUserType([USER_TYPE.PICKER]));
const isAdministrator = computed(() => session.hasUserType([USER_TYPE.ADMINISTRATOR]));
const isChecker = computed(() => session.hasUserType([USER_TYPE.CHECKER]));
</script>

<template>
    <PickingQueue v-if="isPicker" />
    <CheckQueue v-else-if="isChecker" />
    <template v-else-if="isAdministrator">
        <PickingIssueList />
        <RejectedCheckList />
    </template>
    <div v-else class="card">
        <h1 class="text-2xl font-semibold mb-2">Olá{{ firstName ? `, ${firstName}` : '' }}</h1>
        <p class="text-muted-color m-0">Separação e conferência de remessas importadas do Sisloc.</p>
    </div>
</template>
