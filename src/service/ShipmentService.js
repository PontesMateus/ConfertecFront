import { http } from './http';

export const ShipmentService = {
    /** @param {{ shippingDateFrom?: string, shippingDateTo?: string }} filter inclusive 'YYYY-MM-DD' bounds */
    list: (filter = {}) => {
        const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value)).toString();
        return http.get(query ? `/shipments?${query}` : '/shipments');
    },
    get: (shipmentUuid) => http.get(`/shipments/${shipmentUuid}`),
    /** @param {File} file Sisloc delivery receipt PDF */
    // Retyped: some systems report an empty or odd type for .pdf files, and the API only reads application/pdf
    import: (file) => http.upload(`/shipments/import?${new URLSearchParams({ fileName: file.name })}`, new Blob([file], { type: 'application/pdf' })),
    update: (shipmentUuid, header) => http.put(`/shipments/${shipmentUuid}`, header),
    delete: (shipmentUuid) => http.delete(`/shipments/${shipmentUuid}`)
};
