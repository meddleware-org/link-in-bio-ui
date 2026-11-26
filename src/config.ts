// Build-time values (Docker build arguments, baked into the bundle). None has a default: a deployment that does not give one gets no
// link. Everything else the app shows about the deployment (its name, hosts, price, sign-up mode, Sui network) comes from
// `GET /api/v1/instance` at run time.
// `safeHref` accepts only addresses that are safe to link; `safePath` only same-site paths.
import { safeHref, safePath } from '@meddleware/web-utils'

/** A build-time link, or null when it is unset or not safe to link. */
function link(v: string | undefined): string | null {
  // The value without stray spaces.
  const s = v?.trim()
  // Not given: no link.
  if (!s) return null
  // Only a safe address or path becomes a link; anything else (a `javascript:` address, say) is dropped.
  return safeHref(s) ?? safePath(s) ?? null
}

/** The terms of service; hidden when unset. */
export const TERMS_URL = link(import.meta.env.VITE_TERMS_URL)
/** The privacy notice; hidden when unset. */
export const PRIVACY_URL = link(import.meta.env.VITE_PRIVACY_URL)

/** The product's generic name, until the instance says what this deployment calls it. */
export const DEFAULT_PRODUCT = 'Link in Bio'
