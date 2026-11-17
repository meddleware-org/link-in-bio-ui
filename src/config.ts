// Build-time values (Docker build arguments, baked into the bundle). None has a default: a deployment that does not give one gets no
// link. Everything else the app shows about the deployment (its name, hosts, price, sign-up mode, Sui network) comes from
// `GET /api/v1/instance` at run time.
import { safeHref, safePath } from '@meddleware/web-utils'

function link(v: string | undefined): string | null {
  const s = v?.trim()
  if (!s) return null
  return safeHref(s) ?? safePath(s) ?? null
}

export const TERMS_URL = link(import.meta.env.VITE_TERMS_URL)
export const PRIVACY_URL = link(import.meta.env.VITE_PRIVACY_URL)

/** The product's generic name, until the instance says what this deployment calls it. */
export const DEFAULT_PRODUCT = 'Link in Bio'
