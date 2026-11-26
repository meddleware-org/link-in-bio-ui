// A small router of the app's own: four areas by path, the browser's history, nothing else. The areas are
//   /            the app (sign-up, sign-in, the page editor, billing, the account)
//   /report      the report form (no account)
//   /admin/      the operator console
//   /edit        the local editor (the loopback backend of `link-in-bio serve --mode local`)
// Vue's reactive reference.
import { ref, type Ref } from 'vue'

/** The four areas of the app. */
export type Area = 'app' | 'report' | 'console' | 'edit'

/** The area a path belongs to. */
export function areaFor(pathname: string): Area {
  // The path without trailing slashes (`/` stays `/`).
  const p = pathname.replace(/\/+$/, '') || '/'
  // The operator console.
  if (p === '/admin' || p.startsWith('/admin/')) return 'console'
  // The report form, which needs no account.
  if (p === '/report') return 'report'
  // The local editor.
  if (p === '/edit') return 'edit'
  // Everything else is the app.
  return 'app'
}

/** Whether the page is served from this computer (where `/` may be the local editor). */
export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

/** The current path and query, and a way to move. */
export interface Router {
  path: Ref<string>
  query: Ref<URLSearchParams>
  navigate(to: string): void
}

/** A router over `window.location`, or over a fixed starting place (tests, embedding). */
export function createRouter(start?: string): Router {
  // Start from the given place (tests, embedding), or the browser's address.
  const initial = start ?? (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search)
  // Parse it against a dummy base so a bare path works.
  const u = new URL(initial, 'http://localhost')
  // The current path.
  const path = ref(u.pathname)
  // The current query.
  const query = ref(u.searchParams)
  // Update the refs from a new address.
  const sync = (href: string) => {
    const next = new URL(href, 'http://localhost')
    path.value = next.pathname
    query.value = next.searchParams
  }
  // Follow the browser's back and forward buttons.
  if (start === undefined && typeof window !== 'undefined') {
    window.addEventListener('popstate', () => sync(window.location.pathname + window.location.search))
  }
  return {
    path,
    query,
    navigate(to) {
      // Only same-site paths: a navigation can never leave the origin.
      if (!to.startsWith('/')) return
      // Push the new address so the back button works (not for a fixed starting place).
      if (start === undefined && typeof window !== 'undefined') window.history.pushState(null, '', to)
      sync(to)
    },
  }
}
