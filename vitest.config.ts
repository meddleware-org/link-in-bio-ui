// Vitest configuration for the unit and component tests (`npm test`): the fleet's shared test settings with the Vue plugin, the shared test setup, and the Chain Payments packages inlined.
// Vitest's typed configuration helper.
import { defineConfig } from 'vitest/config'
// The Vue single-file-component plugin.
import vue from '@vitejs/plugin-vue'
// The fleet's shared test settings.
import { vueTestConfig } from '@meddleware/frontend-config/vitest'

// Unit and component tests: the API layer, WebAuthn conversion, the editor's document model, the local editor's loopback-only
// guarantee, checkout following, and the views against fake services. jsdom hosts the mounts; the real-browser gate is e2e/ (Playwright).
// The Chain Payments kit and client ship TypeScript and Vue source, so they are inlined, and the libraries they share are deduplicated.
// The shared settings plus the shared test setup and the inlined Chain Payments packages.
const config = vueTestConfig({
  plugins: [vue()],
  test: { setupFiles: ['tests/support/setup.ts'], server: { deps: { inline: [/chain-payments-(kit|client)/] } } },
})
// One copy of each library the packages share.
config.resolve = { dedupe: ['vue', '@vue/test-utils', '@meddleware/ui', '@meddleware/design-tokens', '@meddleware/web-utils', '@mysten/sui'] }

// The configuration Vitest reads.
export default defineConfig(config)
