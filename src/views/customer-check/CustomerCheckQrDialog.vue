<script setup>
import { customerCheckUrl } from '@/service/CustomerCheckService';
import { formatDateTime } from '@/utils/date';
import QRCode from 'qrcode';
import { useToast } from 'primevue/usetoast';
import { computed, ref, watch } from 'vue';

/** Shows the link of a customer check as a QR Code, for the customer's inspector to open on their phone */
const props = defineProps({
    /** `{ token, expiresAt }` as the API gives it, once */
    link: { type: Object, default: null }
});
const visible = defineModel('visible', { type: Boolean, default: false });

const toast = useToast();
const imageUrl = ref('');
const url = computed(() => (props.link ? customerCheckUrl(props.link.token) : ''));

watch(
    [visible, url],
    async ([open, value]) => {
        if (!open || !value) return;
        imageUrl.value = await QRCode.toDataURL(value, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    },
    { immediate: true }
);

async function copy() {
    try {
        await navigator.clipboard.writeText(url.value);
        toast.add({ severity: 'success', summary: 'Link copiado', life: 2000 });
    } catch {
        toast.add({ severity: 'warn', summary: 'Não foi possível copiar', detail: url.value, life: 8000 });
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Conferência pelo cliente" modal :style="{ width: '26rem' }" :breakpoints="{ '575px': '95vw' }">
        <div v-if="link" class="flex flex-col items-center gap-4 text-center">
            <p class="m-0 text-muted-color">Peça ao inspetor do cliente para ler o QR Code com a câmera do celular e conferir os materiais.</p>
            <img v-if="imageUrl" :src="imageUrl" alt="QR Code da conferência pelo cliente" class="w-64 h-64 rounded-border border border-surface bg-white p-2" />
            <Skeleton v-else width="16rem" height="16rem" />
            <small class="text-muted-color">Válido até {{ formatDateTime(link.expiresAt) }}. Só o primeiro aparelho que iniciar a conferência pode continuá-la.</small>
            <Button label="Copiar link" icon="pi pi-copy" severity="secondary" text size="small" @click="copy" />
        </div>

        <template #footer>
            <Button label="Fechar" @click="visible = false" />
        </template>
    </Dialog>
</template>
