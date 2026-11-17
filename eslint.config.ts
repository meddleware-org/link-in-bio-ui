import { vueApp } from '@meddleware/frontend-config/eslint'

// The fleet's Vue + TypeScript + accessibility + browser-compat config. dist-e2e/ is the end-to-end build (built output, like dist/).
export default vueApp({ name: 'link-in-bio-ui', ignores: ['**/dist-e2e/**'] })
