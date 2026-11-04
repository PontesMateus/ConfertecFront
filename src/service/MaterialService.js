import { http } from './http';

export const MaterialService = {
    list: () => http.get('/materials'),
    create: (material) => http.post('/materials', material),
    update: (materialUuid, material) => http.put(`/materials/${materialUuid}`, material),
    setObsolete: (materialUuid, obsolete) => http.patch(`/materials/${materialUuid}/obsolete`, { obsolete }),
    delete: (materialUuid) => http.delete(`/materials/${materialUuid}`)
};
