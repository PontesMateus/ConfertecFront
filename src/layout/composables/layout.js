import { computed, reactive } from 'vue';

const DARK_MODE_KEY = 'confertec.darkMode';

function readDarkMode() {
    try {
        return localStorage.getItem(DARK_MODE_KEY) === 'true';
    } catch {
        return false;
    }
}

const layoutConfig = reactive({
    darkTheme: readDarkMode(),
    menuMode: 'static'
});

document.documentElement.classList.toggle('app-dark', layoutConfig.darkTheme);

const layoutState = reactive({
    staticMenuInactive: false,
    overlayMenuActive: false,
    mobileMenuActive: false,
    menuHoverActive: false,
    activeMenuItem: null,
    activePath: null
});

export function useLayout() {
    const executeDarkModeToggle = () => {
        layoutConfig.darkTheme = !layoutConfig.darkTheme;
        document.documentElement.classList.toggle('app-dark', layoutConfig.darkTheme);
        try {
            localStorage.setItem(DARK_MODE_KEY, String(layoutConfig.darkTheme));
        } catch {
            // Preference just won't be remembered
        }
    };

    const toggleDarkMode = () => {
        if (!document.startViewTransition) {
            executeDarkModeToggle();
            return;
        }
        document.startViewTransition(() => executeDarkModeToggle());
    };

    const toggleMenu = () => {
        if (isDesktop()) {
            if (layoutConfig.menuMode === 'static') {
                layoutState.staticMenuInactive = !layoutState.staticMenuInactive;
            }
            if (layoutConfig.menuMode === 'overlay') {
                layoutState.overlayMenuActive = !layoutState.overlayMenuActive;
            }
        } else {
            layoutState.mobileMenuActive = !layoutState.mobileMenuActive;
        }
    };

    const hideMobileMenu = () => {
        layoutState.mobileMenuActive = false;
    };

    const isDarkTheme = computed(() => layoutConfig.darkTheme);
    const isDesktop = () => window.innerWidth > 991;
    const hasOpenOverlay = computed(() => layoutState.overlayMenuActive);

    return {
        layoutConfig,
        layoutState,
        isDarkTheme,
        toggleDarkMode,
        toggleMenu,
        hideMobileMenu,
        isDesktop,
        hasOpenOverlay
    };
}
