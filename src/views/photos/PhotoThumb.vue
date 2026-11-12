<script setup>
import { PhotoService } from '@/service/PhotoService';
import { ref, watch } from 'vue';

/** A photo stored by the API, small, opening full size on click */
const props = defineProps({
    photoUuid: { type: String, required: true },
    alt: { type: String, required: true },
    /** Tailwind size classes of the thumbnail */
    sizeClass: { type: String, default: 'w-12 h-12' }
});

const url = ref(null);
const failed = ref(false);

watch(
    () => props.photoUuid,
    async (photoUuid) => {
        url.value = null;
        failed.value = false;
        try {
            const value = await PhotoService.getUrl(photoUuid);
            if (photoUuid === props.photoUuid) url.value = value;
        } catch {
            if (photoUuid === props.photoUuid) failed.value = true;
        }
    },
    { immediate: true }
);
</script>

<template>
    <Image v-if="url" :src="url" :alt="alt" preview :imageClass="`${sizeClass} object-cover rounded-border`" />
    <div v-else-if="failed" :class="sizeClass" class="flex items-center justify-center rounded-border border border-surface text-muted-color" v-tooltip.top="'Não foi possível carregar a foto'">
        <i class="pi pi-image"></i>
    </div>
    <Skeleton v-else :class="sizeClass" />
</template>
