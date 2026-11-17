// The console's shared context: the typed admin API and the way a section asks to open an account.
import { inject, provide, type InjectionKey } from 'vue'
import type { AdminApi } from '../../api/admin.js'

export interface ConsoleContext {
  api: AdminApi
  openAccount(id: string): void
}

const KEY: InjectionKey<ConsoleContext> = Symbol('link-in-bio-console')
export const provideConsole = (c: ConsoleContext): void => provide(KEY, c)
export function useConsole(): ConsoleContext {
  const c = inject(KEY)
  if (!c) throw new Error('useConsole() outside the console')
  return c
}

/** A tags field (`a, b`) as the list the service takes. */
export const tagsOf = (s: string): string[] =>
  s
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
