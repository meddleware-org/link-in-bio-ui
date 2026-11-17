import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { vueTestConfig } from '@meddleware/frontend-config/vitest'

// Unit and component tests: the API layer, WebAuthn conversion, the editor's document model, the local editor's loopback-only
// guarantee, checkout following, and the views against fake services. jsdom hosts the mounts; the real-browser gate is e2e/ (Playwright).
// The Chain Payments kit is linked from a sibling directory with its own node_modules, so the shared libraries are deduplicated.
const config = vueTestConfig({
  plugins: [vue()],
  test: { setupFiles: ['tests/support/setup.ts'], server: { deps: { inline: [/chain-payments-(kit|client)/] } } },
})
config.resolve = { dedupe: ['vue', '@vue/test-utils', '@meddleware/ui', '@meddleware/design-tokens', '@meddleware/web-utils', '@mysten/sui'] }

export default defineConfig(config)
