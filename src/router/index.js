import { SUPERVISOR_TYPES, USER_TYPE } from '@/constants/userType';
import AppLayout from '@/layout/AppLayout.vue';
import { AuthService } from '@/service/AuthService';
import { PickingService } from '@/service/PickingService';
import { setSessionExpiredHandler } from '@/service/http';
import { session } from '@/service/session';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            component: AppLayout,
            children: [
                {
                    path: '',
                    name: 'home',
                    meta: { title: 'Início' },
                    component: () => import('@/views/Home.vue')
                },
                {
                    path: 'users',
                    name: 'users',
                    meta: { title: 'Usuários', userTypes: [USER_TYPE.ADMINISTRATOR] },
                    component: () => import('@/views/users/UserList.vue')
                },
                {
                    path: 'materials',
                    name: 'materials',
                    meta: { title: 'Materiais', userTypes: [USER_TYPE.ADMINISTRATOR] },
                    component: () => import('@/views/materials/MaterialList.vue')
                },
                {
                    path: 'checks/:checkUuid',
                    name: 'check',
                    meta: { title: 'Conferência', userTypes: [USER_TYPE.OPERATOR] },
                    component: () => import('@/views/checks/CheckView.vue'),
                    props: true
                },
                {
                    path: 'picking-batches/:batchUuid',
                    name: 'picking',
                    meta: { title: 'Separação', userTypes: [USER_TYPE.OPERATOR] },
                    component: () => import('@/views/pickings/PickingView.vue'),
                    props: true
                },
                {
                    // Older links to a single picking open the batch it belongs to
                    path: 'pickings/:pickingUuid',
                    meta: { userTypes: [USER_TYPE.OPERATOR] },
                    // Never shown: beforeEnter always redirects (a record with `redirect` would skip beforeEnter)
                    component: () => import('@/views/pickings/PickingView.vue'),
                    beforeEnter: async (to) => {
                        try {
                            const picking = await PickingService.get(to.params.pickingUuid);
                            return { name: 'picking', params: { batchUuid: picking.batchUuid }, replace: true };
                        } catch {
                            return { name: 'home', replace: true };
                        }
                    }
                },
                {
                    path: 'assignments',
                    name: 'assignments',
                    meta: { title: 'Atribuições', userTypes: SUPERVISOR_TYPES },
                    component: () => import('@/views/assignments/AssignmentBoard.vue')
                },
                {
                    path: 'assignments/:batchUuid',
                    name: 'assignment',
                    meta: { title: 'Grupo de separação', userTypes: SUPERVISOR_TYPES },
                    component: () => import('@/views/assignments/PickingBatchDetail.vue'),
                    props: true
                },
                {
                    path: 'shipments',
                    name: 'shipments',
                    meta: { title: 'Remessas', userTypes: [USER_TYPE.ADMINISTRATOR] },
                    component: () => import('@/views/shipments/ShipmentList.vue')
                },
                {
                    path: 'shipments/:shipmentUuid',
                    name: 'shipment',
                    meta: { title: 'Remessa', userTypes: [USER_TYPE.ADMINISTRATOR] },
                    component: () => import('@/views/shipments/ShipmentDetail.vue'),
                    props: true
                }
            ]
        },
        {
            // Public, outside the layout: the customer's inspector checks from the QR Code, without a login
            path: '/customer-check/:token',
            name: 'customerCheck',
            meta: { public: true, title: 'Conferência de materiais' },
            component: () => import('@/views/customer-check/CustomerCheck.vue'),
            props: true
        },
        {
            path: '/auth/login',
            name: 'login',
            meta: { public: true, title: 'Entrar' },
            component: () => import('@/views/pages/auth/Login.vue')
        },
        {
            path: '/auth/access',
            name: 'accessDenied',
            meta: { public: true, title: 'Acesso negado' },
            component: () => import('@/views/pages/auth/Access.vue')
        },
        {
            path: '/auth/error',
            name: 'error',
            meta: { public: true, title: 'Erro' },
            component: () => import('@/views/pages/auth/Error.vue')
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'notfound',
            meta: { public: true, title: 'Página não encontrada' },
            component: () => import('@/views/pages/NotFound.vue')
        }
    ]
});

let profileLoaded = false;

router.beforeEach(async (to) => {
    if (to.meta.public) {
        return to.name === 'login' && session.isAuthenticated.value ? { name: 'home' } : true;
    }
    if (!session.isAuthenticated.value) {
        return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
    }

    // Once per page load, so a user type changed by an administrator applies to the menu and routes
    if (!profileLoaded) {
        try {
            await AuthService.loadProfile();
            profileLoaded = true;
        } catch {
            // Session expired, or API offline: then keep the stored profile
            if (!session.isAuthenticated.value) return { name: 'login', query: { redirect: to.fullPath } };
        }
    }

    if (!session.hasUserType(to.meta.userTypes)) {
        return { name: 'accessDenied' };
    }
});

router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} | Confertec` : 'Confertec';
});

// A page whose code fails to load (usually files replaced by a new deploy) would leave the click doing nothing:
// reload that address once, and show the error page if it fails again
const RELOADED_KEY = 'confertec.reloadedFor';
router.onError((error, to) => {
    console.error(error);
    let reloadedFor = null;
    try {
        reloadedFor = sessionStorage.getItem(RELOADED_KEY);
        sessionStorage.setItem(RELOADED_KEY, to.fullPath);
    } catch {
        // Storage blocked: go straight to the error page, never into a reload loop
        reloadedFor = to.fullPath;
    }
    if (reloadedFor === to.fullPath) router.push({ name: 'error' });
    else window.location.assign(to.fullPath);
});
router.afterEach(() => {
    try {
        sessionStorage.removeItem(RELOADED_KEY);
    } catch {
        // Nothing to clear
    }
});

setSessionExpiredHandler(() => {
    const current = router.currentRoute.value;
    router.push({ name: 'login', query: current.meta.public ? {} : { redirect: current.fullPath } });
});

export default router;
