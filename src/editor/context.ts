// What the editor's pieces share: the document being edited (reactive), the limits, the placed issues and the link screening. Provided
// by PageEditor; the link and group pieces read it with `useEditor()` and change the document through it.
import { inject, provide, type InjectionKey, type Ref } from 'vue'
import type { Limits, Screening } from '../api/types.js'
import type { PageDoc, PlacedIssues } from './model.js'

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

const KEY: InjectionKey<EditorContext> = Symbol('link-in-bio-editor')

export const provideEditor = (c: EditorContext): void => provide(KEY, c)

export function useEditor(): EditorContext {
  const c = inject(KEY)
  if (!c) throw new Error('useEditor() outside PageEditor')
  return c
}

/** Words for a link's screening verdict, and a badge tone. */
export function verdictWords(v: Screening['verdict']): { text: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  switch (v) {
    case 'clean':
      return { text: 'Checked: no problem found', tone: 'ok' }
    case 'flagged':
      return { text: 'Hidden: flagged as unsafe, waiting for a person to decide', tone: 'danger' }
    case 'unknown':
      return { text: 'Could not be checked yet: shown, and checked again within the hour', tone: 'warn' }
    default:
      return { text: 'Not checked yet: checked when you publish', tone: 'neutral' }
  }
}
