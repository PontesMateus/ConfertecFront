import { http } from './http';
import { session } from './session';

export const AuthService = {
    async login(login, password) {
        const tokens = await http.post('/auth/login', { login, password });
        session.setTokens(tokens);
        await this.loadProfile();
    },

    /** Reloads the current user, so a user type changed by an administrator is picked up. */
    async loadProfile() {
        session.setUser(await http.get('/users/me'));
    },

    async logout() {
        const { refreshToken } = session.state;
        session.clear();
        if (refreshToken) {
            // The local session is already gone; a failed server-side revoke is not worth surfacing
            await http.post('/auth/logout', { refreshToken }).catch(() => {});
        }
    }
};
