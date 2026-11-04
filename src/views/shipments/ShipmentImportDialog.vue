<script setup>
import { ShipmentService } from '@/service/ShipmentService';
import { ref, watch } from 'vue';

// Same limit as the API route (shipment.routes.js)
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const emit = defineEmits(['imported']);
const visible = defineModel('visible', { type: Boolean, default: false });

const file = ref(null);
const fileInput = ref(null);
const dragging = ref(false);
const importing = ref(false);
const errorMessage = ref('');

watch(visible, (open) => {
    if (!open) return;
    file.value = null;
    errorMessage.value = '';
});

function choose(chosen) {
    errorMessage.value = '';
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith('.pdf')) {
        errorMessage.value = 'Escolha o comprovante de entrega em PDF exportado do Sisloc.';
        return;
    }
    if (chosen.size > MAX_SIZE_BYTES) {
        errorMessage.value = 'O arquivo deve ter no máximo 10 MB.';
        return;
    }
    file.value = chosen;
}

function onDrop(event) {
    dragging.value = false;
    choose(event.dataTransfer.files[0]);
}

function onInputChange(event) {
    choose(event.target.files[0]);
    // Lets the same file be chosen again after an error
    event.target.value = '';
}

function formatSize(bytes) {
    return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

async function submit() {
    if (!file.value) {
        errorMessage.value = 'Escolha um arquivo.';
        return;
    }
    importing.value = true;
    errorMessage.value = '';
    try {
        const shipment = await ShipmentService.import(file.value);
        emit('imported', shipment);
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        importing.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Importar remessa" modal :closable="!importing" :style="{ width: '34rem' }" :breakpoints="{ '575px': '95vw' }">
        <div class="flex flex-col gap-4">
            <p class="m-0 text-muted-color">Envie o comprovante de entrega (romaneio de expedição) exportado do Sisloc em PDF. Todos os materiais precisam estar cadastrados e ativos.</p>

            <button
                type="button"
                class="flex flex-col items-center justify-center gap-2 p-6 rounded-border border-2 border-dashed cursor-pointer transition-colors bg-transparent text-color"
                :class="dragging ? 'border-primary bg-highlight' : 'border-surface-300 dark:border-surface-600 hover:border-primary'"
                :disabled="importing"
                @click="fileInput.click()"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="onDrop"
            >
                <i class="pi pi-file-pdf text-4xl text-brand"></i>
                <template v-if="file">
                    <span class="font-medium break-all">{{ file.name }}</span>
                    <span class="text-sm text-muted-color">{{ formatSize(file.size) }} · clique para trocar</span>
                </template>
                <template v-else>
                    <span class="font-medium">Arraste o PDF aqui ou clique para escolher</span>
                    <span class="text-sm text-muted-color">Até 10 MB</span>
                </template>
            </button>
            <input ref="fileInput" type="file" accept="application/pdf,.pdf" class="hidden" @change="onInputChange" />

            <Message severity="secondary" size="small" variant="simple">O veículo não vem no arquivo: informe-o depois na remessa importada.</Message>
            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </div>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text :disabled="importing" @click="visible = false" />
            <Button label="Importar" icon="pi pi-upload" :loading="importing" :disabled="!file" @click="submit" />
        </template>
    </Dialog>
</template>
