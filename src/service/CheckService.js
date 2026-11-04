import { http } from './http';

/** Blind checks: nothing here returns the shipment or picked quantities */
export const CheckService = {
    /** Finished pickings waiting for a check, with the check in progress if any */
    listQueue: () => http.get('/checks/queue'),
    /** Administrador: pickings whose latest check found differences, with quantities */
    listRejected: () => http.get('/checks/rejected'),
    /** Administrador: the shipment's checks, newest first, with quantities once finished */
    listByShipment: (shipmentUuid) => http.get(`/checks?shipmentUuid=${shipmentUuid}`),
    start: (pickingUuid) => http.post('/checks', { pickingUuid }),
    get: (checkUuid) => http.get(`/checks/${checkUuid}`),
    /** Sets (not adds) the counted quantity */
    setItemQty: (checkUuid, lineUuid, qty) => http.put(`/checks/${checkUuid}/items/${lineUuid}`, { qty }),
    /** @param {{ customerInspection: boolean, companyPersonQty: number, customerPersonQty: number }} details */
    finish: (checkUuid, details) => http.post(`/checks/${checkUuid}/finish`, details)
};
