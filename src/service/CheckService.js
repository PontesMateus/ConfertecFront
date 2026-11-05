import { http } from './http';

/** Blind checks: nothing here returns the shipment or picked quantities */
export const CheckService = {
    /** Picking batches whose shipments are all finished, waiting for a check, with the check in progress if any */
    listQueue: () => http.get('/checks/queue'),
    /** Administrador: batches whose latest check found differences, with quantities per shipment */
    listRejected: () => http.get('/checks/rejected'),
    /** Administrador: the shipment's checks, newest first, with quantities once finished */
    listByShipment: (shipmentUuid) => http.get(`/checks?shipmentUuid=${shipmentUuid}`),
    /** Counts the whole batch: one count per material over every shipment */
    start: (batchUuid) => http.post('/checks', { batchUuid }),
    get: (checkUuid) => http.get(`/checks/${checkUuid}`),
    /** Sets (not adds) the counted quantity of a material, over every shipment of the check */
    setItemQty: (checkUuid, materialUuid, qty) => http.put(`/checks/${checkUuid}/items/${materialUuid}`, { qty }),
    /** @param {{ customerInspection: boolean, companyPersonQty: number, customerPersonQty: number }} details */
    finish: (checkUuid, details) => http.post(`/checks/${checkUuid}/finish`, details)
};
