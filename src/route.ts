// A small router of the app's own: four areas by path, the browser's history, nothing else. The areas are
//   /            the app (sign-up, sign-in, the page editor, billing, the account)
//   /report      the report form (no account)
//   /admin/      the operator console
//   /edit        the local editor (the loopback backend of `link-in-bio serve --mode local`)
import { ref, type Ref } from 'vue'

export type Area = 'app' | 'report' | 'console' | 'edit'

export function areaFor(pathname: string): Area {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/admin' || p.startsWith('/admin/')) return 'console'
  if (p === '/report') return 'report'
  if (p === '/edit') return 'edit'
  return 'app'
}

/** Whether the page is served from this computer (where `/` may be the local editor). */
export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

export interface Router {
  path: Ref<string>
  query: Ref<URLSearchParams>
  navigate(to: string): void
}

/** A router over `window.location`, or over a fixed starting place (tests, embedding). */
export function createRouter(start?: string): Router {
  const initial = start ?? (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search)
  const u = new URL(initial, 'http://localhost')
  const path = ref(u.pathname)
  const query = ref(u.searchParams)
  const sync = (href: string) => {
    const next = new URL(href, 'http://localhost')
    path.value = next.pathname
    query.value = next.searchParams
  }
  if (start === undefined && typeof window !== 'undefined') {
    window.addEventListener('popstate', () => sync(window.location.pathname + window.location.search))
  }
  return {
    path,
    query,
    navigate(to) {
      if (!to.startsWith('/')) return
      if (start === undefined && typeof window !== 'undefined') window.history.pushState(null, '', to)
      sync(to)
    },
  }
}
