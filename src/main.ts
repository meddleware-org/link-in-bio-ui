// Standalone SPA bootstrap: the design-token and ui reset stylesheets, then the App shell. (The library path, src/index.ts, exports
// LinkInBioView and leaves global styles to the host.)
import '@meddleware/design-tokens/tokens.css'
import '@meddleware/design-tokens/seasons.css'
import '@meddleware/ui/reset.css'
import { createApp } from 'vue'
import { useSeason } from '@meddleware/ui'

useSeason()
void (async () => {
  // End-to-end builds only: a mock wallet and a stub chain (`src/e2e.ts`). Both conditions are static, so no other build contains it.
  if (import.meta.env.MODE === 'e2e' && import.meta.env.VITE_E2E === '1') (await import('./e2e.js')).installE2e()
  const { default: App } = await import('./App.vue')
  createApp(App).mount('#app')
})()
