import { onMounted, onUnmounted, readonly, ref, watch } from 'vue';
import { getFreshAccessToken } from './http';
import { session } from './session';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const MAX_RETRY_DELAY_MS = 30000;
const CLOSE_TOKEN_EXPIRED = 4001;
/** Moving from one screen to another unsubscribes then subscribes again: keep the socket meanwhile */
const IDLE_CLOSE_DELAY_MS = 5000;

/**
 * One WebSocket per tab, opened while any screen is subscribed. Events only say that something changed
 * (e.g. `pickingQueue.changed`): the screen refetches through its REST service.
 * After a dropped connection comes back, every handler runs once with `{ type, reconnected: true }`,
 * since events sent while offline were missed.
 */
const handlers = new Map(); // type -> Set<handler>
let socket = null;
let retryDelay = 1000;
let retryTimer = null;
let wasConnected = false;
let connecting = false;
const connected = ref(false);
let idleTimer = null;

function hasSubscribers() {
    return [...handlers.values()].some((set) => set.size > 0);
}

function socketUrl(token) {
    const url = new URL(`${BASE_URL}/ws`, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token);
    return url.toString();
}

function dispatch(type, message) {
    for (const handler of handlers.get(type) ?? []) handler(message);
}

async function connect() {
    if (socket || connecting || !hasSubscribers()) return;
    connecting = true;
    // The server closes the socket when this token expires; a fresh one buys the full 15 minutes
    const token = await getFreshAccessToken();
    connecting = false;
    if (!token || socket || !hasSubscribers()) return;

    const ws = new WebSocket(socketUrl(token));
    socket = ws;

    ws.onopen = () => {
        retryDelay = 1000;
        connected.value = true;
        if (wasConnected) for (const type of handlers.keys()) dispatch(type, { type, reconnected: true });
        wasConnected = true;
    };
    ws.onmessage = (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        dispatch(message.type, message);
    };
    ws.onclose = (event) => {
        if (socket !== ws) return; // closed on purpose
        connected.value = false;
        socket = null;
        // An expired token reconnects right away with a new one; anything else backs off
        const delay = event.code === CLOSE_TOKEN_EXPIRED ? 0 : retryDelay;
        if (event.code !== CLOSE_TOKEN_EXPIRED) retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
        retryTimer = setTimeout(connect, delay);
    };
}

function disconnect() {
    clearTimeout(retryTimer);
    retryTimer = null;
    wasConnected = false;
    connected.value = false;
    const ws = socket;
    socket = null;
    ws?.close();
}

// Logout or an ended session closes the connection
watch(
    () => session.state.refreshToken,
    (refreshToken) => {
        if (!refreshToken) disconnect();
    }
);

export const realtime = {
    /** True while the socket is open; screens can fall back to polling when it is not */
    connected: readonly(connected),

    /**
     * Calls `handler(message)` on each event of `type`. Returns the unsubscribe function: call it in onUnmounted.
     * @param {string} type e.g. 'pickingQueue.changed'
     * @param {(message: { type: string, reconnected?: boolean }) => void} handler
     */
    subscribe(type, handler) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(handler);
        clearTimeout(idleTimer);
        connect();
        return () => {
            handlers.get(type)?.delete(handler);
            if (hasSubscribers()) return;
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                if (!hasSubscribers()) disconnect();
            }, IDLE_CLOSE_DELAY_MS);
        };
    }
};

/**
 * For a list or detail screen: calls `refetch()` after each event of `type`, once per burst of events (`delayMs`
 * after the last one). Subscribes on mount and cleans up on unmount; call it in `<script setup>`.
 * @param {string} type e.g. 'pickingQueue.changed'
 * @param {() => void} refetch usually a silent reload, so the screen doesn't flash a loading state
 * @param {{ when?: (message: object) => boolean, delayMs?: number }} [options] `when`: only events this screen
 *   shows, e.g. its own shipment; a reconnection always refetches, since events may have been missed
 */
export function useRealtimeRefresh(type, refetch, { when = () => true, delayMs = 300 } = {}) {
    let timer = null;
    let unsubscribe = null;
    onMounted(() => {
        unsubscribe = realtime.subscribe(type, (message) => {
            if (!message.reconnected && !when(message)) return;
            clearTimeout(timer);
            timer = setTimeout(refetch, delayMs);
        });
    });
    onUnmounted(() => {
        unsubscribe?.();
        clearTimeout(timer);
    });
}
