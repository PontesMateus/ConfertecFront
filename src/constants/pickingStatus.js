// picking_status.picking_status_id (ConfertecData 028, ConfertecApi shared/constants/pickingStatus.js).
// Compare `statusId` with these; `status` (the description) is only for display.
export const PICKING_STATUS = Object.freeze({
    PENDING: 1,
    IN_PROGRESS: 2,
    DONE: 3,
    CHECKED: 4,
    BLOCKED: 5,
    CANCELED: 6
});

/** Tag severity by status id */
export const PICKING_STATUS_SEVERITY = Object.freeze({
    [PICKING_STATUS.PENDING]: 'warn',
    [PICKING_STATUS.IN_PROGRESS]: 'info',
    [PICKING_STATUS.DONE]: 'success',
    [PICKING_STATUS.CHECKED]: 'contrast',
    [PICKING_STATUS.BLOCKED]: 'danger',
    [PICKING_STATUS.CANCELED]: 'secondary'
});
