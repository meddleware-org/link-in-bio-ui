import { definePlaywrightConfig } from '@meddleware/frontend-config/playwright'

// Browser tests of the BUILT app: Chromium locally, all five browser projects in CI (E2E_BROWSERS=all to run them locally). The e2e build
// (`--mode e2e`, to dist-e2e/, so dist/ stays the production build) registers a mock wallet and a stub chain; the service is answered in
// the specs (page.route), and every request that leaves localhost is refused, so runs need no network. The preview serves the production
// CSP with an example Chain Payments origin. The screenshot capture (`npm run shots`) is for looking, not asserting.
export default definePlaywrightConfig({
  port: 4299,
  command: 'npm run build:e2e && CHAIN_PAYMENTS_ORIGIN=https://pay.example.org npx vite preview --outDir dist-e2e --port 4299 --strictPort',
})
