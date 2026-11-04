import { computed, reactive } from 'vue';

const STORAGE_KEY = 'confertec.session';

function load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
        return {};
    }
}

const state = reactive({
    accessToken: null,
    refreshToken: null,
    user: null,
    ...load()
});

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const session = {
    state,
    isAuthenticated: computed(() => Boolean(state.refreshToken)),

    /** True when the route/menu item has no restriction or the current user's type is in the list. */
    hasUserType(userTypes) {
        return !userTypes?.length || userTypes.includes(state.user?.userType);
    },

    setTokens({ accessToken, refreshToken }) {
        state.accessToken = accessToken;
        state.refreshToken = refreshToken;
        persist();
    },

    setUser(user) {
        state.user = user;
        persist();
    },

    clear() {
        state.accessToken = null;
        state.refreshToken = null;
        state.user = null;
        localStorage.removeItem(STORAGE_KEY);
    }
};
