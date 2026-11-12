import { http } from './http';

/** The picker's side: their assigned batches and the pickings in them */
export const PickingService = {
    /** Batches assigned to the caller with a picking still to do, with each shipment's progress */
    listMine: () => http.get('/picking-batches/mine'),
    get: (pickingUuid) => http.get(`/pickings/${pickingUuid}`),
    /** Pickings picked together on one screen; each one is finished on its own */
    getBatch: (batchUuid) => http.get(`/picking-batches/${batchUuid}`),
    /** The assigned picker starts the batch: every "Pendente" picking goes "Em andamento"; returns the batch */
    startBatch: (batchUuid) => http.post(`/picking-batches/${batchUuid}/start`),
    /** Sets (not adds) the quantity picked so far */
    setItemQty: (pickingUuid, lineUuid, qty) => http.put(`/pickings/${pickingUuid}/items/${lineUuid}`, { qty }),
    /**
     * Adds a photo of a material picked: a material takes one or more, shared by every shipment of the batch; a picked
     * line only counts as picked with at least one. Returns `{ materialUuid, photoUuid, items }`: the material's lines in
     * the batch, with `pickingUuid` and every photo (`photoUuids`)
     */
    addMaterialPhoto: (batchUuid, materialUuid, photo) => http.post(`/picking-batches/${batchUuid}/materials/${materialUuid}/photos`, photo),
    /** Removes one of the material's photos; returns `{ materialUuid, items }`, as on adding */
    removeMaterialPhoto: (batchUuid, materialUuid, photoUuid) => http.delete(`/picking-batches/${batchUuid}/materials/${materialUuid}/photos/${photoUuid}`),
    /** The photo of the customer's inspector's ID document, required to finish with an inspection; returns `{ photoUuid }` */
    setInspectorPhoto: (pickingUuid, photo) => http.put(`/pickings/${pickingUuid}/customer-inspector-photo`, photo),
    /**
     * @param {{ customerInspection: boolean, customerInspectorName?: string, companyPersonQty: number }} details
     *   the name is required with an inspection
     */
    finish: (pickingUuid, details) => http.post(`/pickings/${pickingUuid}/finish`, details),
    listIssueTypes: () => http.get('/picking-issue-types'),
    /** @param {{ lineUuid: string, issueTypeUuid: string, qty: number, description?: string }} issue; returns the whole picking */
    reportIssue: (pickingUuid, issue) => http.post(`/pickings/${pickingUuid}/issues`, issue),
    /** Returns the whole picking */
    withdrawIssue: (pickingUuid, issueUuid) => http.delete(`/pickings/${pickingUuid}/issues/${issueUuid}`)
};
