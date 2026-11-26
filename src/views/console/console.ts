// The console's shared context: the typed admin API and the way a section asks to open an account.
// Vue's dependency injection: the context is provided once and every section injects it.
import { inject, provide, type InjectionKey } from 'vue'
// The typed operator API.
import type { AdminApi } from '../../api/admin.js'

/** What every section may use: the typed operator API and a way to open an account in the accounts section. */
export interface ConsoleContext {
  api: AdminApi
  openAccount(id: string): void
}

// The injection key for the console context.
const KEY: InjectionKey<ConsoleContext> = Symbol('link-in-bio-console')
/** Provide the context to every section below the console. */
export const provideConsole = (c: ConsoleContext): void => provide(KEY, c)
/** The console context; throws when used outside the console. */
export function useConsole(): ConsoleContext {
  // The context, if the console provided one.
  const c = inject(KEY)
  // Using a section outside the console is a programming error, so fail loudly.
  if (!c) throw new Error('useConsole() outside the console')
  return c
}

/** A tags field (`a, b`) as the list the service takes. */
/** A tags field (`a, b`) as the list the service takes: trimmed, lower-case, no empty entries. */
export const tagsOf = (s: string): string[] =>
  s
    // Split on commas.
    .split(',')
    // Trim and lower-case each tag.
    .map((t) => t.trim().toLowerCase())
    // Drop empty ones.
    .filter(Boolean)
