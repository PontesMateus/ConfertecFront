import { publicRequest } from './http';

/**
 * Public: the customer's inspector checks a batch through the link of a QR Code, without a login. After start,
 * every request carries the browser's session key, which binds the link to the browser that started it.
 */
export const CustomerCheckService = {
    get: (token, sessionKey) => publicRequest('GET', `/customer-checks/${token}`, undefined, sessionHeader(sessionKey)),
    /** Returns `{ sessionKey, check }`; keep the key to go on (also after reopening the link) */
    start: (token, inspectorName, sessionKey) => publicRequest('POST', `/customer-checks/${token}/start`, { inspectorName }, sessionHeader(sessionKey)),
    /** Sets (not adds) the counted quantity of a material, over every shipment; returns whether it matches */
    setItemQty: (token, sessionKey, materialUuid, qty) => publicRequest('PUT', `/customer-checks/${token}/items/${materialUuid}`, { qty }, sessionHeader(sessionKey)),
    /** Only when every material matches */
    finish: (token, sessionKey) => publicRequest('POST', `/customer-checks/${token}/finish`, {}, sessionHeader(sessionKey))
};

function sessionHeader(sessionKey) {
    return sessionKey ? { 'X-Customer-Session': sessionKey } : {};
}

/** Address of the customer's page for a link token, as the QR Code encodes it */
export function customerCheckUrl(token) {
    return `${window.location.origin}/customer-check/${token}`;
}
