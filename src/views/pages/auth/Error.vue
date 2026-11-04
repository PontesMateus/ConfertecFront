<template>
    <div class="flex items-center justify-center min-h-screen px-4 bg-surface-50 dark:bg-surface-950">
        <div class="text-center">
            <i class="pi pi-exclamation-triangle text-red-500 text-5xl!"></i>
            <h1 class="text-surface-900 dark:text-surface-0 font-semibold text-3xl mt-4 mb-2">Ocorreu um erro</h1>
            <p class="text-muted-color mb-8">Não foi possível concluir a operação. Tente novamente.</p>
            <Button as="router-link" label="Voltar ao início" icon="pi pi-home" to="/" />
        </div>
    </div>
</template>
