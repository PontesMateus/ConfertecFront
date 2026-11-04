// The API exchanges calendar days as 'YYYY-MM-DD'; these keep them in local time so the day never shifts.

/** 'YYYY-MM-DD' → 'DD/MM/AAAA'; empty for no date. */
export function formatDate(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
}

/** ISO timestamp → 'DD/MM/AAAA HH:mm' in local time. */
export function formatDateTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** 'YYYY-MM-DD' → Date at local midnight, for DatePicker. */
export function fromIsoDate(isoDate) {
    if (!isoDate) return null;
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/** Date → 'YYYY-MM-DD' from its local day; null for no date. */
export function toIsoDate(date) {
    if (!date) return null;
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
