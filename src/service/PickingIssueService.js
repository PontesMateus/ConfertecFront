import { http } from './http';

/** Administrador: follow and resolve shortages reported by pickers */
export const PickingIssueService = {
    /** @param {{ open?: boolean, shipmentUuid?: string }} [filter] omit a field to not filter by it */
    list: (filter = {}) => {
        const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value !== undefined && value !== null)).toString();
        return http.get(query ? `/picking-issues?${query}` : '/picking-issues');
    },
    listResolutionTypes: () => http.get('/picking-issue-resolution-types'),
    /**
     * @param {{ resolutionTypeUuid: string, note?: string, substitute?: { materialUuid: string, qty: number } }} resolution
     * @returns {Promise<{ issue: object, resolvedIssueCount: number, revisionNumber: number|null }>} a substitution resolves every open issue of the shipment
     */
    resolve: (issueUuid, resolution) => http.post(`/picking-issues/${issueUuid}/resolution`, resolution),
    /**
     * Resolves with a new Sisloc list (PDF), which becomes the next revision and resolves every open issue of the shipment.
     * @returns {Promise<{ issue: object, resolvedIssueCount: number, revisionNumber: number }>}
     */
    resolveWithList: (issueUuid, file, note) => {
        const query = new URLSearchParams({ fileName: file.name, ...(note?.trim() ? { note: note.trim() } : {}) });
        // Retyped: some systems report an empty or odd type for .pdf files, and the API only reads application/pdf
        return http.upload(`/picking-issues/${issueUuid}/resolution/list?${query}`, new Blob([file], { type: 'application/pdf' }));
    }
};
