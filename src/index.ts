// Library entry point: a host renders LinkInBioView to show the app inline. It talks only to its own origin's `/api/v1` (and, while
// paying, to the Chain Payments origin and the Sui full node), so a host must serve it on the app host (or the admin host for /admin/).
export { default as LinkInBioView } from './LinkInBioView.vue'
export type { Area } from './route.js'
