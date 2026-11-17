// The page document (schema 1, crates/core/src/manifest.rs) as the editor holds it, and the operations the form performs on it: add,
// remove and move links and groups, read the document back for saving, and place the server's issues next to the fields they name.
// Pure functions over plain objects: the editor wraps the document in Vue's reactivity, the tests use it as it is.

import type { Issue } from '../api/errors.js'

export interface LinkDoc {
  kind: 'link'
  id: string
  title: string
  url: string
  description?: string
  icon?: string
  /** One of the person's own profiles: rendered with `rel="me"`. */
  identity?: boolean
  hidden?: boolean
}

export interface GroupDoc {
  kind: 'group'
  id: string
  title: string
  open?: boolean
  items: LinkDoc[]
}

export type ItemDoc = LinkDoc | GroupDoc

export interface IdentityDoc {
  kind?: 'person' | 'organization'
  displayName: string
  handle: string
  bio?: string
  pronouns?: string
  avatar?: string
  [k: string]: unknown
}

export interface ContactDoc {
  label: string
  url: string
}

export type ThemeDoc = Partial<Record<ThemeKey, string>>

export interface PageDoc {
  schema: 1
  identity: IdentityDoc
  items: ItemDoc[]
  theme: ThemeDoc
  contact: ContactDoc[]
  /** Everything the form does not edit (support, meta, …) is kept as it came and sent back unchanged. */
  [k: string]: unknown
}

export const THEME_KEYS = ['colorMode', 'season', 'accent', 'buttons', 'radius', 'density', 'layout', 'font'] as const
export type ThemeKey = (typeof THEME_KEYS)[number]
export type ThemeOptions = Record<ThemeKey, string[]>

/**
 * The theme options of schema 1 (crates/core/src/theme.rs). The loopback editor serves them (`/api/v1/theme/options`); the hosted API
 * has no such route, so the hosted editor uses this copy.
 */
export const SCHEMA_1_THEME: ThemeOptions = {
  colorMode: ['system', 'light', 'dark'],
  season: ['none', 'spring', 'summer', 'autumn', 'winter'],
  accent: ['season', 'red', 'orange', 'yellow', 'green', 'blue', 'terracotta', 'moss', 'slate'],
  buttons: ['filled', 'outline', 'plain'],
  radius: ['xs', 'sm', 'md', 'lg'],
  density: ['comfortable', 'compact'],
  layout: ['list', 'cards'],
  font: ['sans', 'serif', 'rounded', 'mono'],
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function readLink(v: unknown): LinkDoc {
  const o = obj(v)
  const l: LinkDoc = { kind: 'link', id: str(o.id), title: str(o.title), url: str(o.url) }
  if (typeof o.description === 'string') l.description = o.description
  if (typeof o.icon === 'string') l.icon = o.icon
  if (o.identity === true) l.identity = true
  if (o.hidden === true) l.hidden = true
  return l
}

/** A document from whatever the server sent: missing parts get their defaults, the form's fields get their types. */
export function normalise(raw: unknown): PageDoc {
  const o = obj(raw)
  const id = obj(o.identity)
  const items: ItemDoc[] = (Array.isArray(o.items) ? o.items : []).map((i: unknown) => {
    const io = obj(i)
    if (io.kind === 'group') {
      const g: GroupDoc = { kind: 'group', id: str(io.id), title: str(io.title), items: (Array.isArray(io.items) ? io.items : []).map(readLink) }
      if (io.open === true) g.open = true
      return g
    }
    return readLink(i)
  })
  const theme: ThemeDoc = {}
  for (const k of THEME_KEYS) if (typeof obj(o.theme)[k] === 'string') theme[k] = obj(o.theme)[k] as string
  const contact = (Array.isArray(o.contact) ? o.contact : []).map((c: unknown) => ({ label: str(obj(c).label), url: str(obj(c).url) }))
  return {
    ...o,
    schema: 1,
    identity: { ...id, displayName: str(id.displayName), handle: str(id.handle) },
    items,
    theme,
    contact,
  }
}

/** Every link and group, groups' links included, in page order. */
export function allItems(doc: PageDoc): ItemDoc[] {
  return doc.items.flatMap((i) => (i.kind === 'group' ? [i, ...i.items] : [i]))
}

export function linkCount(doc: PageDoc): number {
  return allItems(doc).filter((i) => i.kind === 'link').length
}

export function groupCount(doc: PageDoc): number {
  return doc.items.filter((i) => i.kind === 'group').length
}

/** An id no item has yet (`link-1`, `link-2` …). */
export function newId(doc: PageDoc, prefix: 'link' | 'group'): string {
  const taken = new Set(allItems(doc).map((i) => i.id))
  for (let n = 1; ; n++) if (!taken.has(`${prefix}-${n}`)) return `${prefix}-${n}`
}

/** Add an empty link at the end of the page, or of the group `groupId`. */
export function addLink(doc: PageDoc, groupId?: string): LinkDoc {
  const link: LinkDoc = { kind: 'link', id: newId(doc, 'link'), title: '', url: '' }
  const group = groupId ? doc.items.find((i): i is GroupDoc => i.kind === 'group' && i.id === groupId) : undefined
  ;(group ? group.items : doc.items).push(link)
  return link
}

export function addGroup(doc: PageDoc): GroupDoc {
  const group: GroupDoc = { kind: 'group', id: newId(doc, 'group'), title: '', items: [] }
  doc.items.push(group)
  return group
}

/** The list an item sits in (the page's, or its group's) and its place there. */
export function locate(doc: PageDoc, id: string): { list: ItemDoc[]; index: number; group: GroupDoc | null } | null {
  const top = doc.items.findIndex((i) => i.id === id)
  if (top >= 0) return { list: doc.items, index: top, group: null }
  for (const g of doc.items) {
    if (g.kind !== 'group') continue
    const index = g.items.findIndex((i) => i.id === id)
    if (index >= 0) return { list: g.items, index, group: g }
  }
  return null
}

export function removeItem(doc: PageDoc, id: string): boolean {
  const at = locate(doc, id)
  if (!at) return false
  at.list.splice(at.index, 1)
  return true
}

export function canMove(doc: PageDoc, id: string, delta: -1 | 1): boolean {
  const at = locate(doc, id)
  if (!at) return false
  const to = at.index + delta
  return to >= 0 && to < at.list.length
}

/** Move an item one place up (-1) or down (+1) in its own list. Returns its new position (0-based), or null when it cannot move. */
export function moveItem(doc: PageDoc, id: string, delta: -1 | 1): number | null {
  const at = locate(doc, id)
  if (!at || !canMove(doc, id, delta)) return null
  const [item] = at.list.splice(at.index, 1)
  at.list.splice(at.index + delta, 0, item!)
  return at.index + delta
}

function cleanLink(l: LinkDoc): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: 'link', id: l.id, title: l.title.trim(), url: l.url.trim() }
  if (l.description?.trim()) out.description = l.description.trim()
  if (l.icon) out.icon = l.icon
  if (l.identity) out.identity = true
  if (l.hidden) out.hidden = true
  return out
}

/**
 * The document to send: optional text left empty is left out (the parser treats a missing field and an empty one alike, but a
 * smaller document is easier to read back), and `false` flags are dropped. Required fields are sent as typed, so the server's own
 * message says what is missing.
 */
export function toDocument(doc: PageDoc): Record<string, unknown> {
  const { identity, items, theme, contact, ...rest } = doc
  const id: Record<string, unknown> = { ...identity, displayName: identity.displayName.trim(), handle: identity.handle.trim() }
  for (const k of ['bio', 'pronouns', 'avatar'] as const) {
    const v = typeof id[k] === 'string' ? (id[k] as string).trim() : ''
    if (v) id[k] = v
    else delete id[k]
  }
  if (id.kind !== 'organization') delete id.kind
  const t: Record<string, string> = {}
  for (const k of THEME_KEYS) if (theme[k]) t[k] = theme[k]!
  const out: Record<string, unknown> = {
    ...rest,
    schema: 1,
    identity: id,
    items: items.map((i) =>
      i.kind === 'group'
        ? { kind: 'group', id: i.id, title: i.title.trim(), ...(i.open ? { open: true } : {}), items: i.items.map(cleanLink) }
        : cleanLink(i),
    ),
    theme: t,
  }
  if (contact.length) out.contact = contact.map((c) => ({ label: c.label.trim(), url: c.url.trim() }))
  return out
}

// ── issues next to fields ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The key of a field the form shows. Links and groups are keyed by their id (not their position), so an issue stays on its link after
 * the link is moved: `item:<id>/<field>`. Everything else keeps the server's path: `identity/displayName`, `theme`, `contact/0/url`.
 */
export const itemKey = (id: string, field: string): string => `item:${id}/${field}`

/** A DOM id for a field key (`item:link-1/url` → `f-item-link-1-url`). */
export const fieldId = (key: string): string => `f-${key.replace(/[^A-Za-z0-9_-]+/g, '-')}`

export interface PlacedIssues {
  /** Messages by field key. */
  byField: Map<string, string[]>
  /** Each issue with the key it was placed on (`''` for the document as a whole), in the server's order. */
  all: Array<Issue & { key: string }>
}

/** Place each issue (paths into the document as it was sent) on the field it names. */
export function placeIssues(doc: PageDoc, issues: Issue[]): PlacedIssues {
  const byField = new Map<string, string[]>()
  const all: PlacedIssues['all'] = []
  for (const issue of issues) {
    const key = keyFor(doc, issue.path)
    all.push({ ...issue, key })
    byField.set(key, [...(byField.get(key) ?? []), issue.message])
  }
  return { byField, all }
}

function keyFor(doc: PageDoc, path: string): string {
  const parts = path.split('/').filter((p) => p !== '')
  if (parts[0] !== 'items' || parts.length < 2) return parts.join('/')
  const top = doc.items[Number(parts[1])]
  if (!top) return 'items'
  if (top.kind === 'group' && parts[2] === 'items' && parts.length >= 4) {
    const inner = top.items[Number(parts[3])]
    if (inner) return itemKey(inner.id, parts.slice(4).join('/'))
    return itemKey(top.id, 'items')
  }
  return itemKey(top.id, parts.slice(2).join('/'))
}

/** The messages for one field. */
export function messagesFor(placed: PlacedIssues | null, key: string): string[] {
  return placed?.byField.get(key) ?? []
}

/** The first message for one field, for a form field's `error`. */
export function errorFor(placed: PlacedIssues | null, key: string): string | null {
  const m = messagesFor(placed, key)
  return m.length ? m.join(' ') : null
}
