<template>
    <div class="flex items-center justify-center min-h-screen px-4 bg-surface-50 dark:bg-surface-950">
        <div class="text-center">
            <img src="/images/logo-black.png" alt="Temec" class="h-12 mx-auto mb-10 object-contain dark:hidden" />
            <img src="/images/logo-white-sub.png" alt="Temec" class="h-12 mx-auto mb-10 object-contain hidden dark:block" />
            <span class="text-brand font-bold text-5xl">404</span>
            <h1 class="text-surface-900 dark:text-surface-0 font-semibold text-3xl mt-2 mb-2">Página não encontrada</h1>
            <p class="text-muted-color mb-8">O endereço acessado não existe.</p>
            <Button as="router-link" label="Voltar ao início" icon="pi pi-home" to="/" />
        </div>
    </div>
</template>
