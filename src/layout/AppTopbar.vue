<script setup>
import { useLayout } from '@/layout/composables/layout';
import { AuthService } from '@/service/AuthService';
import { session } from '@/service/session';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const { toggleMenu, toggleDarkMode, isDarkTheme } = useLayout();
const router = useRouter();

const user = computed(() => session.state.user);

async function logout() {
    await AuthService.logout();
    router.push({ name: 'login' });
}
</script>

<template>
    <div class="layout-topbar">
        <div class="layout-topbar-logo-container">
            <button class="layout-menu-button layout-topbar-action" aria-label="Alternar menu" @click="toggleMenu">
                <i class="pi pi-bars"></i>
            </button>
            <router-link to="/" class="layout-topbar-logo">
                <img src="/images/logo-white-sub.png" alt="Temec" />
                <span class="layout-topbar-app-name">Confertec</span>
            </router-link>
        </div>

        <div class="layout-topbar-actions">
            <div class="layout-config-menu">
                <button type="button" class="layout-topbar-action" :aria-label="isDarkTheme ? 'Usar tema claro' : 'Usar tema escuro'" @click="toggleDarkMode">
                    <i :class="['pi', { 'pi-moon': isDarkTheme, 'pi-sun': !isDarkTheme }]"></i>
                </button>
            </div>

            <button
                class="layout-topbar-menu-button layout-topbar-action"
                aria-label="Mais opções"
                v-styleclass="{ selector: '@next', enterFromClass: 'hidden', enterActiveClass: 'p-anchored-overlay-enter-active', leaveToClass: 'hidden', leaveActiveClass: 'p-anchored-overlay-leave-active', hideOnOutsideClick: true }"
            >
                <i class="pi pi-ellipsis-v"></i>
            </button>

            <div class="layout-topbar-menu hidden lg:block">
                <div class="layout-topbar-menu-content items-center">
                    <div v-if="user" class="layout-topbar-user hidden lg:flex">
                        <span class="font-medium">{{ user.name }}</span>
                        <small>{{ user.userType }}</small>
                    </div>
                    <button type="button" class="layout-topbar-action" aria-label="Sair" @click="logout">
                        <i class="pi pi-sign-out"></i>
                        <span>Sair</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
