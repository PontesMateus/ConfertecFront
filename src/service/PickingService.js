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
     * @param {{ customerInspection: boolean, customerInspectorName?: string, companyPersonQty: number, customerCheck?: boolean }} details
     *   the name is required with an inspection; `customerCheck` (last picking of a one-customer batch) hands the check to
     *   the customer's inspector, and the response then has `customerCheckLink` ({ checkUuid, token, expiresAt })
     */
    finish: (pickingUuid, details) => http.post(`/pickings/${pickingUuid}/finish`, details),
    listIssueTypes: () => http.get('/picking-issue-types'),
    /** @param {{ lineUuid: string, issueTypeUuid: string, qty: number, description?: string }} issue; returns the whole picking */
    reportIssue: (pickingUuid, issue) => http.post(`/pickings/${pickingUuid}/issues`, issue),
    /** Returns the whole picking */
    withdrawIssue: (pickingUuid, issueUuid) => http.delete(`/pickings/${pickingUuid}/issues/${issueUuid}`)
};
