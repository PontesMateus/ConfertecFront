# ConfertecFront

Web app for Conferentes (who pick and check what is assigned to them), Encarregados (who assign) and administrators. Vue 3 (`<script setup>`, JavaScript), PrimeVue 4 (Aura with the Temec preset), Tailwind CSS 4, built from the Sakai template.

## Commands

```bash
npm run dev       # http://localhost:5173; /api is proxied to VITE_API_PROXY_TARGET
npm run build     # must pass before finishing a change
npm run lint      # ESLint + Prettier (--fix); run it on the files you changed
```

## Structure

- `src/service/*Service.js`: one object per API resource, built on `http.js` (bearer token, one refresh-and-retry on 401, API error messages). Pages never call `fetch` directly.
- `src/views/<feature>/`: pages and their dialogs (`*Dialog.vue` with `v-model:visible`, emitting the saved result).
- `src/router/index.js`: `meta.userTypes` restricts a route (redirects to *Acesso negado*); the menu item in `src/layout/AppMenu.vue` takes the same `userTypes`. The API checks access anyway; the front only hides what the user can't use.
- `src/constants/`: mirrors of API values (`USER_TYPE`, status severities).
- `src/utils/date.js`: `formatDateTime` and the API's `YYYY-MM-DD` conversions.

## Conventions

- `vite.config.mjs` has `optimizeDeps.noDiscovery: true`: a new CommonJS package (like `qrcode`) must go in `optimizeDeps.include`, or the dev server can't load the pages importing it (the build still passes). Restart `npm run dev` after changing it.

- **All visible text in pt-BR**, concise. PrimeVue's own texts come from `primelocale/pt-BR.json`.
- Use PrimeVue components and Tailwind utilities; follow the existing page pattern: a `card` header with title and actions, a `Message` with "Tentar novamente" on load errors, `Skeleton` while loading, a `DataTable` with an `#empty` slot.
- Feedback via `useToast()`; confirmations of destructive or hard-to-undo actions via `useConfirm()`.
- Quantities: `Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })` and `InputNumber` with `locale="pt-BR"`, `:maxFractionDigits="3"`.
- Typed quantities save after a short delay (`SAVE_DELAY_MS`) with a per-row `seq` so only the latest response applies. On error, go back to the last saved value. Don't reload the whole page while a save is pending.
- Colors: Temec amber primary, graphite surfaces. Don't put `text-primary` on light backgrounds (low contrast); use `.text-brand`.
- **Check screens are blind**: never show or compute shipment or picked quantities for the checker.
