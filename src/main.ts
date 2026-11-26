// Standalone SPA bootstrap: the design-token and ui reset stylesheets, then the App shell. (The library path, src/index.ts, exports
// LinkInBioView and leaves global styles to the host.)
// The design tokens: every colour, space and type size the components use.
import '@meddleware/design-tokens/tokens.css'
// The seasonal accent colours that `useSeason` switches between.
import '@meddleware/design-tokens/seasons.css'
// The shared reset and base styles.
import '@meddleware/ui/reset.css'
// Vue's application factory.
import { createApp } from 'vue'
// Applies the seasonal accent colours.
import { useSeason } from '@meddleware/ui'

// Apply the seasonal accent colours.
useSeason()
// Load the end-to-end hooks (in an e2e build only) before the app, then mount it.
void (async () => {
  // End-to-end builds only: a mock wallet and a stub chain (`src/e2e.ts`). Both conditions are static, so no other build contains it.
  if (import.meta.env.MODE === 'e2e' && import.meta.env.VITE_E2E === '1') (await import('./e2e.js')).installE2e()
  // A dynamic import, so the end-to-end installer runs first.
  const { default: App } = await import('./App.vue')
  // Mount the application.
  createApp(App).mount('#app')
})()
