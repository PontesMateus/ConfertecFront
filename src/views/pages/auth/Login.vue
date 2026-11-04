<script setup>
import { useLayout } from '@/layout/composables/layout';
import { AuthService } from '@/service/AuthService';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const { isDarkTheme, toggleDarkMode } = useLayout();
const router = useRouter();
const route = useRoute();

const login = ref('');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');

async function submit() {
    errorMessage.value = '';
    if (!login.value.trim() || !password.value) {
        errorMessage.value = 'Informe usuário e senha';
        return;
    }

    loading.value = true;
    try {
        await AuthService.login(login.value.trim(), password.value);
        const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/';
        router.replace(redirect);
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="login-page min-h-screen flex items-center justify-center px-4">
        <Button class="absolute! top-4 right-4" :icon="isDarkTheme ? 'pi pi-moon' : 'pi pi-sun'" severity="secondary" rounded text :aria-label="isDarkTheme ? 'Usar tema claro' : 'Usar tema escuro'" @click="toggleDarkMode" />

        <div class="w-full max-w-md bg-surface-0 dark:bg-surface-900 rounded-2xl shadow-xl overflow-hidden">
            <div class="h-1.5 bg-primary"></div>
            <div class="px-8 py-10 sm:px-12">
                <div class="text-center mb-8">
                    <img :src="isDarkTheme ? '/images/logo-white-sub.png' : '/images/logo-black.png'" alt="Temec Fôrmas e Escoramentos" class="h-16 mx-auto mb-6 object-contain" />
                    <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0 m-0 mb-1">Confertec</h1>
                    <p class="text-muted-color m-0">Entre para continuar</p>
                </div>

                <form class="flex flex-col gap-5" @submit.prevent="submit">
                    <div class="flex flex-col gap-2">
                        <label for="login" class="font-medium text-surface-900 dark:text-surface-0">Usuário</label>
                        <InputText id="login" v-model="login" autocomplete="username" autofocus fluid />
                    </div>

                    <div class="flex flex-col gap-2">
                        <label for="password" class="font-medium text-surface-900 dark:text-surface-0">Senha</label>
                        <Password id="password" v-model="password" :feedback="false" toggleMask fluid :inputProps="{ autocomplete: 'current-password' }" />
                    </div>

                    <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>

                    <Button type="submit" label="Entrar" icon="pi pi-sign-in" :loading="loading" fluid class="mt-2" />
                </form>
            </div>
        </div>
    </div>
</template>

<style scoped>
.login-page {
    position: relative;
    background: linear-gradient(135deg, transparent 0 60%, color-mix(in srgb, var(--p-primary-500), transparent 85%) 60% 100%), linear-gradient(180deg, var(--p-surface-950), var(--p-surface-900));
}
</style>
