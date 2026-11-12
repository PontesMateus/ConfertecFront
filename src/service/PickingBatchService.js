import { http } from './http';

/** Encarregado and Administrador: build batches and assign their picker and checker */
export const PickingBatchService = {
    /** Batches with work left, newest first, each with its shipments and their picking progress */
    list: () => http.get('/picking-batches'),
    get: (batchUuid) => http.get(`/picking-batches/${batchUuid}`),
    /** @param {{ shipmentUuids: string[], pickerUuid: string, checkerUuid?: string }} batch */
    create: (batch) => http.post('/picking-batches', batch),
    addShipment: (batchUuid, shipmentUuid) => http.post(`/picking-batches/${batchUuid}/shipments`, { shipmentUuid }),
    /** Returns the batch, or `{ deleted: true }` when its last shipment left */
    removePicking: (batchUuid, pickingUuid) => http.delete(`/picking-batches/${batchUuid}/pickings/${pickingUuid}`),
    /** The justification is required once the picking started */
    assignPicker: (batchUuid, userUuid, justification) => http.put(`/picking-batches/${batchUuid}/picker`, { userUuid, justification }),
    /** The justification is required while a check is open */
    assignChecker: (batchUuid, userUuid, justification) => http.put(`/picking-batches/${batchUuid}/checker`, { userUuid, justification }),
    /**
     * Every picking finished, one customer: the customer's inspector checks instead of the checker, through a QR Code.
     * Returns `{ checkUuid, token, expiresAt }`, the only time the token is given out
     */
    releaseCustomerCheck: (batchUuid, inspectorName) => http.post(`/picking-batches/${batchUuid}/customer-check`, { inspectorName: inspectorName || undefined })
};
