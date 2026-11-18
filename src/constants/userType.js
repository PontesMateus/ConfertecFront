// user_type.user_type_id (ConfertecData 028, ConfertecApi shared/constants/userType.js). Compare ids, never descriptions.
export const USER_TYPE = Object.freeze({
    ADMINISTRATOR: 1,
    // Encarregado: builds the batches and assigns their picker and checker
    SUPERVISOR: 2,
    // Conferente: picks and checks, only what is assigned to them
    OPERATOR: 3
});

/** Who builds batches and follows every picking and check */
export const SUPERVISOR_TYPES = [USER_TYPE.ADMINISTRATOR, USER_TYPE.SUPERVISOR];
