import { http } from './http';

export const PickingService = {
    /** Shipments without picking, or whose picking is in progress */
    listQueue: () => http.get('/shipments?toPick=true'),
    /** Starts the shipment's picking in a batch of its own; returns the picking, with its batchUuid */
    start: (shipmentUuid) => http.post('/pickings', { shipmentUuid }),
    get: (pickingUuid) => http.get(`/pickings/${pickingUuid}`),
    /** Pickings picked together on one screen; each one is finished on its own */
    getBatch: (batchUuid) => http.get(`/picking-batches/${batchUuid}`),
    /** Starts the shipment's picking in the batch, or moves the caller's picking in progress into it; returns the batch */
    addShipmentToBatch: (batchUuid, shipmentUuid) => http.post(`/picking-batches/${batchUuid}/shipments`, { shipmentUuid }),
    /** The picking keeps going in a batch of its own; returns the batch it left */
    removeFromBatch: (batchUuid, pickingUuid) => http.delete(`/picking-batches/${batchUuid}/pickings/${pickingUuid}`),
    /** Sets (not adds) the quantity picked so far */
    setItemQty: (pickingUuid, lineUuid, qty) => http.put(`/pickings/${pickingUuid}/items/${lineUuid}`, { qty }),
    /** @param {{ customerInspection: boolean, companyPersonQty: number, customerPersonQty: number }} details */
    finish: (pickingUuid, details) => http.post(`/pickings/${pickingUuid}/finish`, details),
    listIssueTypes: () => http.get('/picking-issue-types'),
    /** @param {{ lineUuid: string, issueTypeUuid: string, qty: number, description?: string }} issue; returns the whole picking */
    reportIssue: (pickingUuid, issue) => http.post(`/pickings/${pickingUuid}/issues`, issue),
    /** Returns the whole picking */
    withdrawIssue: (pickingUuid, issueUuid) => http.delete(`/pickings/${pickingUuid}/issues/${issueUuid}`)
};
