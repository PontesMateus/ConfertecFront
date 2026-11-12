import { session } from './session';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

let onSessionExpired = () => {};

/** Called when the refresh token is rejected; the router uses it to send the user to the login page. */
export function setSessionExpiredHandler(handler) {
    onSessionExpired = handler;
}

/** A Blob/File body is sent as is, with its own type; anything else as JSON. */
async function send(method, path, body, extraHeaders = {}) {
    const isFile = body instanceof Blob;
    const headers = { Accept: 'application/json', ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = isFile ? body.type || 'application/octet-stream' : 'application/json';
    if (session.state.accessToken) headers.Authorization = `Bearer ${session.state.accessToken}`;

    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: body === undefined || isFile ? body : JSON.stringify(body)
        });
    } catch {
        throw new ApiError('Não foi possível conectar ao servidor', 0);
    }

    const data = await response.json().catch(() => null);
    return { response, data };
}

let refreshing = null;

/** Exchanges the refresh token for a new pair; concurrent callers share one request. */
function refreshTokens() {
    refreshing ??= (async () => {
        try {
            const { response, data } = await send('POST', '/auth/refresh', { refreshToken: session.state.refreshToken });
            if (!response.ok) return false;
            session.setTokens(data);
            return true;
        } catch {
            return false;
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}

/** Seconds left on a JWT, from its own `exp`; 0 when unreadable. */
function secondsLeft(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.exp - Date.now() / 1000;
    } catch {
        return 0;
    }
}

/**
 * Returns an access token valid for at least `minSeconds`, refreshing it first when needed; null when the session
 * ended. For connections that can't refresh on a 401, like the WebSocket.
 */
export async function getFreshAccessToken(minSeconds = 30) {
    if (!session.state.refreshToken) return null;
    if (session.state.accessToken && secondsLeft(session.state.accessToken) > minSeconds) return session.state.accessToken;
    if (await refreshTokens()) return session.state.accessToken;
    session.clear();
    onSessionExpired();
    return null;
}

export async function request(method, path, body) {
    let { response, data } = await send(method, path, body);

    // A 401 can mean an expired access token or a missing permission: refresh once and retry.
    // Only a rejected refresh ends the session.
    if (response.status === 401 && !path.startsWith('/auth/') && session.state.refreshToken) {
        if (await refreshTokens()) {
            ({ response, data } = await send(method, path, body));
        } else {
            session.clear();
            onSessionExpired();
            throw new ApiError('Sessão expirada. Entre novamente.', 401);
        }
    }

    if (!response.ok) {
        throw new ApiError(data?.message ?? 'Erro inesperado', response.status);
    }
    return data;
}

/**
 * For the public pages (no login, like the customer's check): no refresh on a 401 and no session handling.
 * `headers`: extra request headers.
 */
export async function publicRequest(method, path, body, headers = {}) {
    const { response, data } = await send(method, path, body, headers);
    if (!response.ok) throw new ApiError(data?.message ?? 'Erro inesperado', response.status);
    return data;
}

/** GETs a file (like a photo) with the session's token, refreshing it once on a 401. Returns a Blob. */
async function requestBlob(path) {
    const fetchFile = async () => {
        try {
            return await fetch(`${BASE_URL}${path}`, { headers: session.state.accessToken ? { Authorization: `Bearer ${session.state.accessToken}` } : {} });
        } catch {
            throw new ApiError('Não foi possível conectar ao servidor', 0);
        }
    };
    let response = await fetchFile();
    if (response.status === 401 && session.state.refreshToken && (await refreshTokens())) response = await fetchFile();
    if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(data?.message ?? 'Erro inesperado', response.status);
    }
    return response.blob();
}

export const http = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body ?? {}),
    patch: (path, body) => request('PATCH', path, body ?? {}),
    put: (path, body) => request('PUT', path, body ?? {}),
    delete: (path) => request('DELETE', path),
    /** POSTs the file itself as the body */
    upload: (path, file) => request('POST', path, file),
    /** A file, as a Blob */
    getBlob: (path) => requestBlob(path)
};
