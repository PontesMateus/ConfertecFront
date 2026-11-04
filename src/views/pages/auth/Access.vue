<template>
    <div class="flex items-center justify-center min-h-screen px-4 bg-surface-50 dark:bg-surface-950">
        <div class="text-center">
            <i class="pi pi-lock text-brand text-5xl!"></i>
            <h1 class="text-surface-900 dark:text-surface-0 font-semibold text-3xl mt-4 mb-2">Acesso negado</h1>
            <p class="text-muted-color mb-8">Você não tem permissão para acessar esta página.</p>
            <Button as="router-link" label="Voltar ao início" icon="pi pi-home" to="/" />
        </div>
    </div>
</template>
