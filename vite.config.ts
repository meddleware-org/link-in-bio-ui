import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { meddlewareApp } from '@meddleware/frontend-config/vite'

// The Content-Security-Policy the production image sends (Dockerfile `ARG CSP`, with the Chain Payments and Sui full node origins the
// build arguments give). `vite preview` sends the same one, with the origins from the environment, so the browser tests run under the
// real policy and a violation fails them. `upgrade-insecure-requests` is left out only because the preview server speaks plain http.
function imageCsp(): string | undefined {
  try {
    const m = /^ARG CSP="([^"]+)"/m.exec(readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8'))
    return m?.[1]
      ?.replace(/\$\{(CHAIN_PAYMENTS_ORIGIN|SUI_RPC_ORIGIN)\}/g, (_, name: string) => process.env[name] ?? '')
      .replace(/ +;/g, ';')
      .replace(/ {2,}/g, ' ')
      .replace(/;\s*upgrade-insecure-requests/, '')
  } catch {
    return undefined
  }
}
const csp = imageCsp()

// The API is same-origin in production (the ingress sends /api/ and /_/ on the app host to the service); in development both are proxied
// to a local service (LINK_IN_BIO_API, default http://127.0.0.1:8080: `link-in-bio serve --mode app`, or `--mode local` for the
// editor). The libraries the Chain Payments kit and client share with the app are deduplicated, so the bundle carries one Vue, one
// @meddleware/ui and one Sui SDK.
const api = process.env.LINK_IN_BIO_API || 'http://127.0.0.1:8080'
export default defineConfig((env) =>
  meddlewareApp({
    name: 'Link in Bio',
    plugins: [vue()],
    config: {
      resolve: { dedupe: ['vue', '@meddleware/ui', '@meddleware/design-tokens', '@meddleware/web-utils', '@meddleware/chain-payments-client', '@mysten/sui'] },
      server: {
        proxy: {
          '/api': { target: api, changeOrigin: true },
          '/_/': { target: api, changeOrigin: true },
        },
      },
      preview: { headers: csp ? { 'Content-Security-Policy': csp } : {} },
    },
  })(env),
)
