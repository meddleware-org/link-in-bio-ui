// The app area's shared context: the HTTP layer and the typed API, what the instance offers, who is signed in, and the router. Provided
// once by AppArea; every app view reads it with `useApp()`.
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { appApi, type AppApi } from './api/app.js'
import type { Http } from './api/http.js'
import type { Instance, Me } from './api/types.js'
import type { Router } from './route.js'

export interface AppContext {
  http: Http
  api: AppApi
  instance: Ref<Instance | null>
  me: Ref<Me | null>
  router: Router
  /** Ask the service who is signed in (null when nobody is). */
  refreshMe(): Promise<Me | null>
}

const KEY: InjectionKey<AppContext> = Symbol('link-in-bio-app')

export function createAppContext(http: Http, router: Router): AppContext {
  const api = appApi(http)
  const me = ref<Me | null>(null)
  return {
    http,
    api,
    instance: ref<Instance | null>(null),
    me,
    router,
    async refreshMe() {
      try {
        me.value = await api.me()
      } catch (e) {
        if ((e as { status?: number }).status === 401) me.value = null
        else throw e
      }
      return me.value
    },
  }
}

export function provideApp(c: AppContext): void {
  provide(KEY, c)
}

export function useApp(): AppContext {
  const c = inject(KEY)
  if (!c) throw new Error('useApp() outside the app area')
  return c
}
