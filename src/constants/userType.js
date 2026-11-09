// Values of user_type.user_type_description seeded by ConfertecData
export const USER_TYPE = Object.freeze({
    ADMINISTRATOR: 'Administrador',
    // Builds the batches and assigns their picker and checker
    SUPERVISOR: 'Encarregado',
    // Picks and checks, only what is assigned to them
    OPERATOR: 'Conferente'
});

/** Who builds batches and follows every picking and check */
export const SUPERVISOR_TYPES = [USER_TYPE.ADMINISTRATOR, USER_TYPE.SUPERVISOR];
