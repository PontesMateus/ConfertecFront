import { fileURLToPath, URL } from 'node:url';

import { PrimeVueResolver } from '@primevue/auto-import-resolver';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { createLogger, defineConfig, loadEnv } from 'vite';

// The API (nodemon) restarts and its WebSocket heartbeat drop sockets abruptly; the realtime client reconnects
// on its own, so those resets are noise. Any other proxy error is still logged.
const logger = createLogger();
const logError = logger.error;
logger.error = (msg, options) => {
    if (options?.error?.code === 'ECONNRESET' && /ws proxy (socket )?error/.test(msg)) return;
    logError(msg, options);
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        customLogger: logger,
        optimizeDeps: {
            noDiscovery: true,
            // With noDiscovery, CommonJS packages must be listed to be converted for the dev server
            // (the build converts them anyway): qrcode draws the QR Code of the customer check
            include: ['qrcode']
        },
        plugins: [
            vue(),
            tailwindcss(),
            Components({
                resolvers: [PrimeVueResolver()]
            })
        ],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url))
            }
        },
        server: {
            port: 5173,
            // Same-origin in development, so the API needs no CORS setup; ws: true also forwards the
            // WebSocket upgrade of /api/ws
            proxy: {
                '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000', ws: true }
            }
        },
        css: {
            preprocessorOptions: {
                scss: {
                    api: 'modern-compiler'
                }
            }
        }
    };
});
