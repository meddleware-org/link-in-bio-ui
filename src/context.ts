// The app area's shared context: the HTTP layer and the typed API, what the instance offers, who is signed in, and the router. Provided
// once by AppArea; every app view reads it with `useApp()`.
// Vue's reactivity and dependency injection: the context is provided once and every view injects it.
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
// The typed account API.
import { appApi, type AppApi } from './api/app.js'
// The HTTP layer.
import type { Http } from './api/http.js'
// What the instance offers and who is signed in.
import type { Instance, Me } from './api/types.js'
// The app's own router.
import type { Router } from './route.js'

/** Everything an app view may use: the HTTP layer and typed API, what the instance offers, who is signed in and the router. */
export interface AppContext {
  http: Http
  api: AppApi
  instance: Ref<Instance | null>
  me: Ref<Me | null>
  router: Router
  /** Ask the service who is signed in (null when nobody is). */
  refreshMe(): Promise<Me | null>
}

// The injection key for the context.
const KEY: InjectionKey<AppContext> = Symbol('link-in-bio-app')

/** Make the context over an HTTP layer and a router. */
export function createAppContext(http: Http, router: Router): AppContext {
  // The typed API over the HTTP layer.
  const api = appApi(http)
  // Who is signed in; null when nobody is.
  const me = ref<Me | null>(null)
  return {
    http,
    api,
    // What the instance offers, filled in by the area when it loads.
    instance: ref<Instance | null>(null),
    me,
    router,
    async refreshMe() {
      try {
        // Ask the service who is signed in.
        me.value = await api.me()
      } catch (e) {
        // Not signed in is an answer, not a failure.
        if ((e as { status?: number }).status === 401) me.value = null
        // Any other failure is the caller's to show.
        else throw e
      }
      return me.value
    },
  }
}

/** Provide the context to every view below the area. */
export function provideApp(c: AppContext): void {
  provide(KEY, c)
}

/** The context; throws when used outside the app area. */
export function useApp(): AppContext {
  // The context, if an area provided one.
  const c = inject(KEY)
  // Using a view outside the area is a programming error, so fail loudly.
  if (!c) throw new Error('useApp() outside the app area')
  return c
}
