import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

import ptBR from 'primelocale/pt-BR.json';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { TemecPreset } from './theme/temecPreset';

import '@/assets/tailwind.css';
import '@/assets/styles.scss';

const app = createApp(App);

app.use(router);
app.use(PrimeVue, {
    locale: ptBR['pt-BR'],
    theme: {
        preset: TemecPreset,
        options: {
            darkModeSelector: '.app-dark'
        }
    }
});
app.use(ToastService);
app.use(ConfirmationService);

app.mount('#app');
