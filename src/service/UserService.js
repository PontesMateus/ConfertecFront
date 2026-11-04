import { http } from './http';

export const UserService = {
    list: () => http.get('/users'),
    create: (user) => http.post('/users', user),
    update: (userUuid, user) => http.put(`/users/${userUuid}`, user),
    resetPassword: (userUuid, newPassword) => http.post(`/users/${userUuid}/password-reset`, { newPassword }),
    setActive: (userUuid, active) => http.patch(`/users/${userUuid}/active`, { active }),
    listUserTypes: () => http.get('/user-types')
};
