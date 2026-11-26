// The page document (schema 1, crates/core/src/manifest.rs) as the editor holds it, and the operations the form performs on it: add,
// remove and move links and groups, read the document back for saving, and place the server's issues next to the fields they name.
// Pure functions over plain objects: the editor wraps the document in Vue's reactivity, the tests use it as it is.

// A finding about a page document.
import type { Issue } from '../api/errors.js'

/** A link as the editor holds it. */
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

/** A group of links, with whether it starts open. */
export interface GroupDoc {
  kind: 'group'
  id: string
  title: string
  open?: boolean
  items: LinkDoc[]
}

/** Anything that sits in a page's list: a link or a group. */
export type ItemDoc = LinkDoc | GroupDoc

/** Who the page is about; any field the form does not edit is kept as it came. */
export interface IdentityDoc {
  kind?: 'person' | 'organization'
  displayName: string
  handle: string
  bio?: string
  pronouns?: string
  avatar?: string
  [k: string]: unknown
}

/** One way to contact the person: a label and an address. */
export interface ContactDoc {
  label: string
  url: string
}

/** The theme choices the person made; a missing key means the default. */
export type ThemeDoc = Partial<Record<ThemeKey, string>>

/** The page document (schema 1). */
export interface PageDoc {
  schema: 1
  identity: IdentityDoc
  items: ItemDoc[]
  theme: ThemeDoc
  contact: ContactDoc[]
  /** Everything the form does not edit (support, meta, …) is kept as it came and sent back unchanged. */
  [k: string]: unknown
}

/** The theme keys the form edits. */
export const THEME_KEYS = ['colorMode', 'season', 'accent', 'buttons', 'radius', 'density', 'layout', 'font'] as const
/** One theme key. */
export type ThemeKey = (typeof THEME_KEYS)[number]
/** The options for each theme key. */
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

/** A plain object from any value (anything else is an empty object). */
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
/** A string from any value (anything else is empty). */
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A link read defensively from whatever the server sent: optional flags only when they are exactly `true`. */
function readLink(v: unknown): LinkDoc {
  // The link as an object.
  const o = obj(v)
  // The required fields, as strings.
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
  // The identity as an object.
  const id = obj(o.identity)
  // The list, read item by item.
  const items: ItemDoc[] = (Array.isArray(o.items) ? o.items : []).map((i: unknown) => {
    const io = obj(i)
    // A group: its title, its links and whether it is open.
    if (io.kind === 'group') {
      const g: GroupDoc = { kind: 'group', id: str(io.id), title: str(io.title), items: (Array.isArray(io.items) ? io.items : []).map(readLink) }
      if (io.open === true) g.open = true
      return g
    }
    return readLink(i)
  })
  // Only theme keys the form knows, and only string values.
  const theme: ThemeDoc = {}
  for (const k of THEME_KEYS) if (typeof obj(o.theme)[k] === 'string') theme[k] = obj(o.theme)[k] as string
  // Contacts as label and address.
  const contact = (Array.isArray(o.contact) ? o.contact : []).map((c: unknown) => ({ label: str(obj(c).label), url: str(obj(c).url) }))
  return {
    // Everything the form does not edit is kept as it came.
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

/** How many links the page has, groups' links included. */
export function linkCount(doc: PageDoc): number {
  return allItems(doc).filter((i) => i.kind === 'link').length
}

/** How many groups the page has. */
export function groupCount(doc: PageDoc): number {
  return doc.items.filter((i) => i.kind === 'group').length
}

/** An id no item has yet (`link-1`, `link-2` …). */
export function newId(doc: PageDoc, prefix: 'link' | 'group'): string {
  // The ids in use.
  const taken = new Set(allItems(doc).map((i) => i.id))
  // The first number that is not taken.
  for (let n = 1; ; n++) if (!taken.has(`${prefix}-${n}`)) return `${prefix}-${n}`
}

/** Add an empty link at the end of the page, or of the group `groupId`. */
export function addLink(doc: PageDoc, groupId?: string): LinkDoc {
  // A new empty link with a fresh id.
  const link: LinkDoc = { kind: 'link', id: newId(doc, 'link'), title: '', url: '' }
  // The group to add it to, if one was named.
  const group = groupId ? doc.items.find((i): i is GroupDoc => i.kind === 'group' && i.id === groupId) : undefined
  // The group's list or the page's.
  ;(group ? group.items : doc.items).push(link)
  return link
}

/** Add an empty group at the end of the page. */
export function addGroup(doc: PageDoc): GroupDoc {
  // A new empty group with a fresh id.
  const group: GroupDoc = { kind: 'group', id: newId(doc, 'group'), title: '', items: [] }
  doc.items.push(group)
  return group
}

/** The list an item sits in (the page's, or its group's) and its place there. */
export function locate(doc: PageDoc, id: string): { list: ItemDoc[]; index: number; group: GroupDoc | null } | null {
  // Look at the page's own list first.
  const top = doc.items.findIndex((i) => i.id === id)
  if (top >= 0) return { list: doc.items, index: top, group: null }
  // Then inside each group.
  for (const g of doc.items) {
    if (g.kind !== 'group') continue
    const index = g.items.findIndex((i) => i.id === id)
    if (index >= 0) return { list: g.items, index, group: g }
  }
  return null
}

/** Remove an item (a link or a group); false when it is not there. */
export function removeItem(doc: PageDoc, id: string): boolean {
  // Where the item is.
  const at = locate(doc, id)
  if (!at) return false
  // Take it out of its list.
  at.list.splice(at.index, 1)
  return true
}

/** Whether an item can move one place in its direction. */
export function canMove(doc: PageDoc, id: string, delta: -1 | 1): boolean {
  const at = locate(doc, id)
  if (!at) return false
  // Where it would go.
  const to = at.index + delta
  // It must stay within its own list.
  return to >= 0 && to < at.list.length
}

/** Move an item one place up (-1) or down (+1) in its own list. Returns its new position (0-based), or null when it cannot move. */
export function moveItem(doc: PageDoc, id: string, delta: -1 | 1): number | null {
  const at = locate(doc, id)
  if (!at || !canMove(doc, id, delta)) return null
  // Take it out, then put it back one place over.
  const [item] = at.list.splice(at.index, 1)
  at.list.splice(at.index + delta, 0, item!)
  return at.index + delta
}

/** A link as it is sent: text trimmed, empty optional fields left out. */
function cleanLink(l: LinkDoc): Record<string, unknown> {
  // The document to send.
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
  // Split off what the form edits from the rest, which is sent back unchanged.
  const { identity, items, theme, contact, ...rest } = doc
  // The identity with its two required fields trimmed.
  const id: Record<string, unknown> = { ...identity, displayName: identity.displayName.trim(), handle: identity.handle.trim() }
  // Optional identity text: trimmed, and left out when empty.
  for (const k of ['bio', 'pronouns', 'avatar'] as const) {
    const v = typeof id[k] === 'string' ? (id[k] as string).trim() : ''
    if (v) id[k] = v
    else delete id[k]
  }
  // A person is the default, so it is not sent.
  if (id.kind !== 'organization') delete id.kind
  // Only the theme choices that were made.
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
  // Contacts only when there are some.
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

/** The issues placed on the fields they name: messages by field key, and every issue with its key. */
export interface PlacedIssues {
  /** Messages by field key. */
  byField: Map<string, string[]>
  /** Each issue with the key it was placed on (`''` for the document as a whole), in the server's order. */
  all: Array<Issue & { key: string }>
}

/** Place each issue (paths into the document as it was sent) on the field it names. */
export function placeIssues(doc: PageDoc, issues: Issue[]): PlacedIssues {
  // Messages by field key.
  const byField = new Map<string, string[]>()
  // Every issue with its key.
  const all: PlacedIssues['all'] = []
  // Place each issue on the field it names.
  for (const issue of issues) {
    const key = keyFor(doc, issue.path)
    all.push({ ...issue, key })
    byField.set(key, [...(byField.get(key) ?? []), issue.message])
  }
  return { byField, all }
}

/** The field key an issue's path names, using the item's id (not its position) so the issue stays on its link after a move. */
function keyFor(doc: PageDoc, path: string): string {
  // The path's segments.
  const parts = path.split('/').filter((p) => p !== '')
  // Paths outside the items keep the server's own form.
  if (parts[0] !== 'items' || parts.length < 2) return parts.join('/')
  // The item the path names, by its position in the document that was sent.
  const top = doc.items[Number(parts[1])]
  // The item is gone: the issue goes on the list.
  if (!top) return 'items'
  // A link inside a group.
  if (top.kind === 'group' && parts[2] === 'items' && parts.length >= 4) {
    // The group's link at that position.
    const inner = top.items[Number(parts[3])]
    if (inner) return itemKey(inner.id, parts.slice(4).join('/'))
    return itemKey(top.id, 'items')
  }
  // A field of the item itself.
  return itemKey(top.id, parts.slice(2).join('/'))
}

/** The messages for one field. */
export function messagesFor(placed: PlacedIssues | null, key: string): string[] {
  return placed?.byField.get(key) ?? []
}

/** The first message for one field, for a form field's `error`. */
export function errorFor(placed: PlacedIssues | null, key: string): string | null {
  // The messages for the field.
  const m = messagesFor(placed, key)
  return m.length ? m.join(' ') : null
}
