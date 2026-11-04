<script setup>
import { MaterialService } from '@/service/MaterialService';
import { PickingIssueService } from '@/service/PickingIssueService';
import { computed, reactive, ref, watch } from 'vue';

// Same limits as the API (PickingIssueController, pickingIssue.routes.js)
const NOTE_MAX_LENGTH = 1000;
const PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024;
// Descriptions seeded in ConfertecData/migrations/009_seed_lookup.sql
const SUBSTITUTE = 'Substituir material';
const WAIT_RESTOCK = 'Aguardar reposição';

const props = defineProps({
    /** Open issue being resolved, as listed by GET /picking-issues */
    issue: { type: Object, default: null },
    /** Open issues of the same shipment, this one included: a new revision resolves them all */
    openIssueCount: { type: Number, default: 1 }
});
/** Emits { issue, resolvedIssueCount, revisionNumber } (revisionNumber null when no revision was created) */
const emit = defineEmits(['resolved']);
const visible = defineModel('visible', { type: Boolean, default: false });

const resolutionTypes = ref([]);
const materials = ref([]);
const loadingOptions = ref(false);
const form = reactive({ resolutionTypeUuid: null, substituteMode: 'material', materialUuid: null, qty: null, file: null, note: '' });
const fileInput = ref(null);
const dragging = ref(false);
const submitted = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const qtyFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const substituteModes = [
    { label: 'Um material', value: 'material', icon: 'pi pi-arrow-right-arrow-left' },
    { label: 'Nova lista do Sisloc', value: 'list', icon: 'pi pi-file-pdf' }
];

const selectedType = computed(() => resolutionTypes.value.find((type) => type.uuid === form.resolutionTypeUuid)?.description);
const isSubstitute = computed(() => selectedType.value === SUBSTITUTE);
const isList = computed(() => isSubstitute.value && form.substituteMode === 'list');
const isSingleMaterial = computed(() => isSubstitute.value && form.substituteMode === 'material');
const shipmentLabel = computed(() => props.issue && `${props.issue.shipment.record}-${props.issue.shipment.recordReceipt}`);
/** Active materials other than the missing one */
const substituteOptions = computed(() => materials.value.filter((material) => !material.obsolete && material.code !== props.issue?.materialCode).map((material) => ({ ...material, label: `${material.code} · ${material.description}` })));

const typeOptions = computed(() =>
    resolutionTypes.value.map((type) => ({
        ...type,
        icon: type.description === SUBSTITUTE ? 'pi pi-arrow-right-arrow-left' : 'pi pi-clock',
        hint: type.description === SUBSTITUTE ? 'Cria uma nova revisão da remessa: troca por um material similar ou por uma nova lista do Sisloc.' : 'A remessa não muda: o separador separa o item quando o material chegar.'
    }))
);

watch(visible, async (open) => {
    if (!open || !props.issue) return;
    Object.assign(form, { resolutionTypeUuid: null, substituteMode: 'material', materialUuid: null, qty: props.issue.qty, file: null, note: '' });
    submitted.value = false;
    errorMessage.value = '';
    if (resolutionTypes.value.length && materials.value.length) return;
    loadingOptions.value = true;
    try {
        [resolutionTypes.value, materials.value] = await Promise.all([PickingIssueService.listResolutionTypes(), MaterialService.list()]);
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        loadingOptions.value = false;
    }
});

const errors = computed(() => ({
    resolutionTypeUuid: !form.resolutionTypeUuid && 'Escolha a resolução',
    materialUuid: isSingleMaterial.value && !form.materialUuid && 'Escolha o material substituto',
    qty: isSingleMaterial.value && !(form.qty > 0) && 'Informe a quantidade do substituto',
    file: isList.value && !form.file && 'Escolha a nova lista em PDF'
}));

function chooseFile(chosen) {
    errorMessage.value = '';
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith('.pdf')) {
        errorMessage.value = 'Escolha o comprovante de entrega em PDF exportado do Sisloc.';
        return;
    }
    if (chosen.size > PDF_MAX_SIZE_BYTES) {
        errorMessage.value = 'O arquivo deve ter no máximo 10 MB.';
        return;
    }
    form.file = chosen;
}

function onDrop(event) {
    dragging.value = false;
    chooseFile(event.dataTransfer.files[0]);
}

function onInputChange(event) {
    chooseFile(event.target.files[0]);
    // Lets the same file be chosen again after an error
    event.target.value = '';
}

async function save() {
    submitted.value = true;
    errorMessage.value = '';
    if (Object.values(errors.value).some(Boolean)) return;

    saving.value = true;
    try {
        if (isList.value) {
            emit('resolved', await PickingIssueService.resolveWithList(props.issue.uuid, form.file, form.note));
        } else {
            emit(
                'resolved',
                await PickingIssueService.resolve(props.issue.uuid, {
                    resolutionTypeUuid: form.resolutionTypeUuid,
                    note: form.note,
                    ...(isSingleMaterial.value ? { substitute: { materialUuid: form.materialUuid, qty: form.qty } } : {})
                })
            );
        }
        visible.value = false;
    } catch (error) {
        errorMessage.value = error.message;
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog v-model:visible="visible" header="Resolver falta" modal :closable="!saving" :style="{ width: '40rem' }" :breakpoints="{ '575px': '95vw' }">
        <form v-if="issue" id="resolve-issue-form" class="flex flex-col gap-5" @submit.prevent="save">
            <div class="p-3 rounded-border bg-surface-100 dark:bg-surface-800">
                <div class="font-medium">{{ issue.materialCode }} · {{ issue.materialDescription }}</div>
                <div class="text-sm text-muted-color mt-1">
                    {{ issue.type }}: falta de <strong class="text-color">{{ qtyFormat.format(issue.qty) }}</strong> · remessa {{ shipmentLabel }} · informada por {{ issue.userName }}
                </div>
                <div v-if="issue.description" class="text-sm mt-2 italic">“{{ issue.description }}”</div>
            </div>

            <div class="flex flex-col gap-2">
                <span class="font-medium">Resolução</span>
                <div v-if="loadingOptions" class="flex flex-col gap-2">
                    <Skeleton v-for="n in 2" :key="n" height="4rem" />
                </div>
                <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                        v-for="type in typeOptions"
                        :key="type.uuid"
                        class="flex gap-3 p-3 rounded-border border cursor-pointer transition-colors"
                        :class="form.resolutionTypeUuid === type.uuid ? 'border-primary bg-highlight' : 'border-surface-200 dark:border-surface-700 hover:border-primary'"
                    >
                        <RadioButton v-model="form.resolutionTypeUuid" :value="type.uuid" name="resolution-type" class="mt-0.5" />
                        <span class="flex flex-col gap-1">
                            <span class="font-medium"><i :class="type.icon" class="mr-1"></i>{{ type.description }}</span>
                            <span class="text-sm text-muted-color">{{ type.hint }}</span>
                        </span>
                    </label>
                </div>
                <small v-if="submitted && errors.resolutionTypeUuid" class="text-red-500">{{ errors.resolutionTypeUuid }}</small>
            </div>

            <template v-if="isSubstitute">
                <SelectButton v-model="form.substituteMode" :options="substituteModes" optionLabel="label" optionValue="value" :allowEmpty="false" class="self-start">
                    <template #option="{ option }">
                        <i :class="option.icon"></i>
                        <span>{{ option.label }}</span>
                    </template>
                </SelectButton>

                <Message v-if="openIssueCount > 1" severity="warn" size="small">
                    A nova revisão resolve também as outras <strong>{{ openIssueCount - 1 }}</strong> {{ openIssueCount - 1 === 1 ? 'falta aberta' : 'faltas abertas' }} desta remessa; os itens delas voltam a ficar pendentes para o separador.
                </Message>

                <template v-if="isSingleMaterial">
                    <div class="flex flex-col gap-2">
                        <label for="resolve-material" class="font-medium">Material substituto</label>
                        <Select
                            inputId="resolve-material"
                            v-model="form.materialUuid"
                            :options="substituteOptions"
                            optionLabel="label"
                            optionValue="uuid"
                            filter
                            filterPlaceholder="Buscar por código ou descrição"
                            :virtualScrollerOptions="{ itemSize: 38 }"
                            placeholder="Escolha um material ativo"
                            :invalid="submitted && !!errors.materialUuid"
                            fluid
                        />
                        <small v-if="submitted && errors.materialUuid" class="text-red-500">{{ errors.materialUuid }}</small>
                    </div>
                    <div class="flex flex-col gap-2">
                        <label for="resolve-qty" class="font-medium">Quantidade do substituto</label>
                        <InputNumber inputId="resolve-qty" v-model="form.qty" :min="0" :maxFractionDigits="3" locale="pt-BR" showButtons :invalid="submitted && !!errors.qty" fluid />
                        <small v-if="submitted && errors.qty" class="text-red-500">{{ errors.qty }}</small>
                        <small v-else class="text-muted-color">O item em falta perde {{ qtyFormat.format(issue.qty) }} na nova revisão e o substituto entra com esta quantidade.</small>
                    </div>
                </template>

                <div v-else class="flex flex-col gap-3">
                    <p class="m-0 text-sm text-muted-color">Para quando a troca não é de um material por outro. Envie o comprovante da remessa {{ shipmentLabel }} já corrigido no Sisloc: ele vira a nova revisão.</p>
                    <button
                        type="button"
                        class="flex flex-col items-center justify-center gap-2 p-5 rounded-border border-2 border-dashed cursor-pointer transition-colors bg-transparent text-color"
                        :class="[dragging ? 'border-primary bg-highlight' : 'border-surface-300 dark:border-surface-600 hover:border-primary', submitted && errors.file ? 'border-red-500' : '']"
                        :disabled="saving"
                        @click="fileInput.click()"
                        @dragover.prevent="dragging = true"
                        @dragleave.prevent="dragging = false"
                        @drop.prevent="onDrop"
                    >
                        <i class="pi pi-file-pdf text-3xl text-brand"></i>
                        <span v-if="form.file" class="font-medium break-all">{{ form.file.name }} <span class="text-sm text-muted-color font-normal">· clique para trocar</span></span>
                        <span v-else class="font-medium">Arraste o PDF aqui ou clique para escolher</span>
                    </button>
                    <input ref="fileInput" type="file" accept="application/pdf,.pdf" class="hidden" @change="onInputChange" />
                    <small v-if="submitted && errors.file" class="text-red-500">{{ errors.file }}</small>
                    <Message severity="warn" size="small">
                        <ul class="m-0 pl-4 flex flex-col gap-1">
                            <li>O que já foi separado é mantido por material. O que saiu da lista ou diminuiu, o separador terá que devolver.</li>
                            <li>Cliente, obra e datas são atualizados pelo arquivo; o veículo é mantido.</li>
                        </ul>
                    </Message>
                </div>
            </template>

            <div class="flex flex-col gap-2">
                <label for="resolve-note" class="font-medium">Observação <span class="text-muted-color font-normal">(opcional)</span></label>
                <Textarea
                    id="resolve-note"
                    v-model="form.note"
                    :maxlength="NOTE_MAX_LENGTH"
                    rows="2"
                    autoResize
                    :placeholder="isSingleMaterial ? 'Ex.: mesma especificação, outra marca' : isList ? 'Ex.: troca combinada com o cliente' : selectedType === WAIT_RESTOCK ? 'Ex.: material chega amanhã de manhã' : ''"
                    fluid
                />
                <small class="text-muted-color">O separador vê esta observação na separação.</small>
            </div>

            <Message v-if="errorMessage" severity="error" size="small" variant="simple">{{ errorMessage }}</Message>
        </form>

        <template #footer>
            <Button label="Cancelar" severity="secondary" text :disabled="saving" @click="visible = false" />
            <Button type="submit" form="resolve-issue-form" :label="isList ? 'Importar lista e criar revisão' : isSingleMaterial ? 'Substituir e criar revisão' : 'Resolver'" icon="pi pi-check" :loading="saving" :disabled="loadingOptions" />
        </template>
    </Dialog>
</template>
