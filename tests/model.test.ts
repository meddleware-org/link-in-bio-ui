// Tests of the page document model (src/editor/model.ts): normalising what the server sent, adding, removing and moving items, writing the document back, and placing the service's issues on
// the fields they name.
import { describe, expect, it } from 'vitest'
import {
  addGroup, addLink, canMove, errorFor, fieldId, itemKey, linkCount, moveItem, normalise, placeIssues, removeItem, toDocument, type GroupDoc,
} from '../src/editor/model.js'

const sample = () =>
  normalise({
    schema: 1,
    identity: { displayName: 'Ada', handle: 'ada', bio: '' },
    items: [
      { kind: 'link', id: 'a', title: 'A', url: 'https://example.org/a' },
      { id: 'b', title: 'B', url: 'https://example.org/b', identity: true },
      { kind: 'group', id: 'g', title: 'G', items: [{ kind: 'link', id: 'c', title: 'C', url: 'https://example.org/c' }] },
    ],
    theme: { accent: 'moss', bogus: 1 },
    support: [{ kind: 'sui-address', address: `0x${'1'.repeat(64)}` }],
    meta: { lang: 'en', indexable: true },
  })

const ids = (doc: ReturnType<typeof sample>) => doc.items.map((i) => i.id)

describe('the document model', () => {
  // Fills in what is missing and types the fields the form edits, keeping everything else.
  it('fills in what is missing and types the fields the form edits, keeping everything else', () => {
    const d = normalise({ identity: { handle: 'x' } })
    expect(d).toMatchObject({ schema: 1, identity: { displayName: '', handle: 'x' }, items: [], theme: {}, contact: [] })
    const s = sample()
    expect(s.items[1]).toEqual({ kind: 'link', id: 'b', title: 'B', url: 'https://example.org/b', identity: true })
    expect(s.theme).toEqual({ accent: 'moss' })
    expect(s.support).toHaveLength(1)
  })

  // Adds links and groups with ids no item has, at the end of the page or of a group.
  it('adds links and groups with ids no item has, at the end of the page or of a group', () => {
    const d = sample()
    expect(addLink(d).id).toBe('link-1')
    expect(addLink(d, 'g').id).toBe('link-2')
    expect((d.items[2] as GroupDoc).items.map((l) => l.id)).toEqual(['c', 'link-2'])
    expect(addGroup(d).id).toBe('group-1')
    expect(ids(d)).toEqual(['a', 'b', 'g', 'link-1', 'group-1'])
    expect(linkCount(d)).toBe(5)
  })

  // Removes an item wherever it is.
  it('removes an item wherever it is', () => {
    const d = sample()
    expect(removeItem(d, 'c')).toBe(true)
    expect((d.items[2] as GroupDoc).items).toEqual([])
    expect(removeItem(d, 'a')).toBe(true)
    expect(removeItem(d, 'nope')).toBe(false)
    expect(ids(d)).toEqual(['b', 'g'])
  })

  // Moves an item one place within its own list, and not past either end.
  it('moves an item one place within its own list, and not past either end', () => {
    const d = sample()
    expect(canMove(d, 'a', -1)).toBe(false)
    expect(canMove(d, 'g', 1)).toBe(false)
    expect(moveItem(d, 'a', -1)).toBeNull()
    expect(moveItem(d, 'a', 1)).toBe(1)
    expect(ids(d)).toEqual(['b', 'a', 'g'])
    expect(moveItem(d, 'g', -1)).toBe(1)
    expect(ids(d)).toEqual(['b', 'g', 'a'])
    // A link in a group moves inside the group only.
    expect(canMove(d, 'c', -1)).toBe(false)
    addLink(d, 'g')
    expect(moveItem(d, 'c', 1)).toBe(1)
    expect((d.items[1] as GroupDoc).items.map((l) => l.id)).toEqual(['link-1', 'c'])
  })

  // Writes the document back without empty optional text or false flags, keeping the rest as it came.
  it('writes the document back without empty optional text or false flags, keeping the rest as it came', () => {
    const d = sample()
    d.items[0] = { ...d.items[0]!, kind: 'link', title: '  A  ', description: '  ', hidden: false } as never
    const out = toDocument(d) as Record<string, any>
    expect(out.identity).toEqual({ displayName: 'Ada', handle: 'ada' })
    expect(out.items[0]).toEqual({ kind: 'link', id: 'a', title: 'A', url: 'https://example.org/a' })
    expect(out.items[1].identity).toBe(true)
    expect(out.items[2]).toEqual({ kind: 'group', id: 'g', title: 'G', items: [{ kind: 'link', id: 'c', title: 'C', url: 'https://example.org/c' }] })
    expect(out.theme).toEqual({ accent: 'moss' })
    expect(out).not.toHaveProperty('contact')
    expect(out.support).toEqual([{ kind: 'sui-address', address: `0x${'1'.repeat(64)}` }])
    expect(out.meta).toEqual({ lang: 'en', indexable: true })
  })

  // Places the service’s issues on the fields they name, by the link’s id rather than its position.
  it('places the service’s issues on the fields they name, by the link’s id rather than its position', () => {
    const d = sample()
    const placed = placeIssues(d, [
      { path: 'identity/displayName', code: 'missing', message: 'This is required.' },
      { path: 'items/1/url', code: 'url_scheme', message: 'Use https.' },
      { path: 'items/2/items/0/title', code: 'missing', message: 'Title needed.' },
      { path: 'items/2/title', code: 'missing', message: 'Group title needed.' },
      { path: 'items/9/url', code: 'missing', message: 'Lost.' },
      { path: 'theme', code: 'contrast', message: 'Not enough contrast.' },
      { path: '', code: 'not_json', message: 'Whole document.' },
    ])
    expect(errorFor(placed, 'identity/displayName')).toBe('This is required.')
    expect(errorFor(placed, itemKey('b', 'url'))).toBe('Use https.')
    expect(errorFor(placed, itemKey('c', 'title'))).toBe('Title needed.')
    expect(errorFor(placed, itemKey('g', 'title'))).toBe('Group title needed.')
    expect(errorFor(placed, 'items')).toBe('Lost.')
    expect(errorFor(placed, 'theme')).toBe('Not enough contrast.')
    expect(placed.all.map((i) => i.key)).toEqual(['identity/displayName', 'item:b/url', 'item:c/title', 'item:g/title', 'items', 'theme', ''])
    // After the person moves the link, the issue is still on that link (its key is its id).
    moveItem(d, 'b', -1)
    expect(errorFor(placed, itemKey('b', 'url'))).toBe('Use https.')
    expect(errorFor(placed, itemKey('a', 'url'))).toBeNull()
  })

  // Makes DOM ids from field keys.
  it('makes DOM ids from field keys', () => {
    expect(fieldId(itemKey('link-1', 'url'))).toBe('f-item-link-1-url')
    expect(fieldId('identity/displayName')).toBe('f-identity-displayName')
  })
})
