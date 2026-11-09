import { http } from './http';

/** Blind checks: nothing here returns the shipment or picked quantities */
export const CheckService = {
    /** Batches assigned to the caller to check, whose shipments are all finished, with the check in progress if any */
    listQueue: () => http.get('/checks/queue'),
    /** Supervisors: batches whose latest check found differences, with quantities per shipment */
    listRejected: () => http.get('/checks/rejected'),
    /** Supervisors: the shipment's checks, newest first, with quantities once finished */
    listByShipment: (shipmentUuid) => http.get(`/checks?shipmentUuid=${shipmentUuid}`),
    /** Counts the whole batch: one count per material over every shipment */
    start: (batchUuid) => http.post('/checks', { batchUuid }),
    get: (checkUuid) => http.get(`/checks/${checkUuid}`),
    /** Sets (not adds) the counted quantity of a material, over every shipment of the check */
    setItemQty: (checkUuid, materialUuid, qty) => http.put(`/checks/${checkUuid}/items/${materialUuid}`, { qty }),
    /** @param {{ customerInspection: boolean, customerInspectorName?: string, companyPersonQty: number }} details; the name is required with an inspection */
    finish: (checkUuid, details) => http.post(`/checks/${checkUuid}/finish`, details),
    /** Supervisors, on a customer check: a new link for the QR Code (the old one stops working); returns { token, expiresAt } */
    regenerateCustomerLink: (checkUuid) => http.post(`/checks/${checkUuid}/link`),
    /** Supervisors: cancels the customer check; the batch goes to its assigned checker */
    cancelCustomerCheck: (checkUuid) => http.delete(`/checks/${checkUuid}`)
};
