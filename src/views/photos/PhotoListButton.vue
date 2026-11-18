<script setup>
import { ref } from 'vue';
import PhotoThumb from './PhotoThumb.vue';

/**
 * How many photos there are; they load only when the dialog opens, so long lists don't fetch every photo at once
 */
const props = defineProps({
    photoUuids: { type: Array, required: true },
    /** Dialog title, e.g. the material code */
    title: { type: String, required: true },
    /** Alt text of each photo, followed by its number */
    altPrefix: { type: String, default: 'Foto' }
});

const visible = ref(false);
</script>

<template>
    <Button :label="`${props.photoUuids.length} ${props.photoUuids.length === 1 ? 'foto' : 'fotos'}`" icon="pi pi-images" size="small" severity="secondary" text class="whitespace-nowrap" :aria-label="`Ver fotos: ${title}`" @click="visible = true" />
    <Dialog v-model:visible="visible" :header="title" modal dismissableMask :style="{ width: '44rem' }" :breakpoints="{ '768px': '95vw' }">
        <div class="flex flex-wrap gap-3">
            <PhotoThumb v-for="(photoUuid, index) in props.photoUuids" :key="photoUuid" :photoUuid="photoUuid" :alt="`${altPrefix} ${index + 1}`" sizeClass="w-32 h-32" />
        </div>
    </Dialog>
</template>
