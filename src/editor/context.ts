// What the editor's pieces share: the document being edited (reactive), the limits, the placed issues and the link screening. Provided
// by PageEditor; the link and group pieces read it with `useEditor()` and change the document through it.
// Vue's dependency injection.
import { inject, provide, type InjectionKey, type Ref } from 'vue'
// The service's limits and link screening.
import type { Limits, Screening } from '../api/types.js'
// The document and its placed issues.
import type { PageDoc, PlacedIssues } from './model.js'

/** What the editor's pieces share: the document, the limits, the placed issues, the screening and the operations on the document. */
export interface EditorContext {
  doc: PageDoc
  limits: Ref<Limits | null>
  placed: Ref<PlacedIssues | null>
  screening: Ref<Screening[]>
  /** Move an item up or down; keeps focus on the moved item's button and announces where it went. */
  move(id: string, delta: -1 | 1): void
  remove(id: string): void
  addLink(groupId?: string): void
}

// The injection key for the editor context.
const KEY: InjectionKey<EditorContext> = Symbol('link-in-bio-editor')

/** Provide the context to the pieces below PageEditor. */
export const provideEditor = (c: EditorContext): void => provide(KEY, c)

/** The editor context; throws when used outside PageEditor. */
export function useEditor(): EditorContext {
  // The context, if PageEditor provided one.
  const c = inject(KEY)
  // Using a piece outside the editor is a programming error, so fail loudly.
  if (!c) throw new Error('useEditor() outside PageEditor')
  return c
}

/** Words for a link's screening verdict, and a badge tone. */
export function verdictWords(v: Screening['verdict']): { text: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  // Words and a tone for each verdict.
  switch (v) {
    // Checked and fine.
    case 'clean':
      return { text: 'Checked: no problem found', tone: 'ok' }
    // Hidden until a person decides.
    case 'flagged':
      return { text: 'Hidden: flagged as unsafe, waiting for a person to decide', tone: 'danger' }
    // Shown, and checked again soon.
    case 'unknown':
      return { text: 'Could not be checked yet: shown, and checked again within the hour', tone: 'warn' }
    // Not checked yet: it will be when the page is published.
    default:
      return { text: 'Not checked yet: checked when you publish', tone: 'neutral' }
  }
}
