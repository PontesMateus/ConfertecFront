<script setup>
import { SUPERVISOR_TYPES, USER_TYPE } from '@/constants/userType';
import { session } from '@/service/session';
import { computed } from 'vue';
import AppMenuItem from './AppMenuItem.vue';

// `userTypes` restricts an item to those user types; keep it in sync with the route's meta.userTypes
const sections = [
    {
        label: 'Geral',
        items: [{ label: 'Início', icon: 'pi pi-fw pi-home', to: '/' }]
    },
    {
        label: 'Operação',
        items: [{ label: 'Atribuições', icon: 'pi pi-fw pi-sitemap', to: '/assignments', userTypes: SUPERVISOR_TYPES }]
    },
    {
        label: 'Administração',
        items: [
            { label: 'Remessas', icon: 'pi pi-fw pi-truck', to: '/shipments', userTypes: [USER_TYPE.ADMINISTRATOR] },
            { label: 'Usuários', icon: 'pi pi-fw pi-users', to: '/users', userTypes: [USER_TYPE.ADMINISTRATOR] },
            { label: 'Materiais', icon: 'pi pi-fw pi-box', to: '/materials', userTypes: [USER_TYPE.ADMINISTRATOR] }
        ]
    }
];

const model = computed(() => sections.map((section) => ({ ...section, items: section.items.filter((item) => session.hasUserType(item.userTypes)) })).filter((section) => section.items.length));
</script>

<template>
    <ul class="layout-menu">
        <template v-for="(item, i) in model" :key="item.label">
            <app-menu-item v-if="!item.separator" :item="item" :index="i"></app-menu-item>
            <li v-if="item.separator" class="menu-separator"></li>
        </template>
    </ul>
</template>
