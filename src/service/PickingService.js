import { http } from './http';

export const PickingService = {
    /** Shipments without picking, or whose picking is in progress */
    listQueue: () => http.get('/shipments?toPick=true'),
    start: (shipmentUuid) => http.post('/pickings', { shipmentUuid }),
    get: (pickingUuid) => http.get(`/pickings/${pickingUuid}`),
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
