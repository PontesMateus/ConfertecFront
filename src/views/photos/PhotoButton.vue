<script setup>
import { shrinkPhoto } from '@/utils/image';
import { ref } from 'vue';

/**
 * Opens the camera (or the gallery, on a computer) and emits `selected` with the photo already shrunk to send.
 * The parent sends it and passes `loading` meanwhile.
 */
defineProps({
    label: { type: String, default: 'Tirar foto' },
    loading: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    size: { type: String, default: undefined },
    severity: { type: String, default: undefined },
    outlined: { type: Boolean, default: false },
    ariaLabel: { type: String, default: undefined }
});
const emit = defineEmits(['selected']);

const input = ref(null);
const preparing = ref(false);

async function onChange(event) {
    const file = event.target.files?.[0];
    // The same photo can be chosen again after a failed upload
    event.target.value = '';
    if (!file) return;
    preparing.value = true;
    try {
        emit('selected', await shrinkPhoto(file));
    } finally {
        preparing.value = false;
    }
}
</script>

<template>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden" @change="onChange" />
    <Button :label="label" icon="pi pi-camera" :size="size" :severity="severity" :outlined="outlined" :aria-label="ariaLabel" :loading="loading || preparing" :disabled="disabled" @click="input.click()" />
</template>
