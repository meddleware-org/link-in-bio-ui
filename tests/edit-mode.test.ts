// The local editor talks to this computer only: every request it makes is a relative `/api/v1/…` path on the page's own (loopback)
// origin, to the loopback editor's routes, and it never asks for the hosted instance, an account, a wallet or a chain.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import LinkInBioView from '../src/LinkInBioView.vue'
import { FakeService } from './support/fake-service.js'
import { button, preload, settle } from './support/mount.js'

const LOCAL_ROUTES = new Set(['/api/v1/manifest', '/api/v1/limits', '/api/v1/theme/options', '/api/v1/preview', '/api/v1/avatar', '/api/v1/validate'])

let w: VueWrapper | null = null
let globalFetch: ReturnType<typeof vi.fn>
beforeEach(async () => {
  await preload()
  // Anything that bypasses the injected fetch (a library, a stray call) would land here and fail the test.
  globalFetch = vi.fn(() => Promise.reject(new Error('the global fetch must not be used')))
  vi.stubGlobal('fetch', globalFetch)
})
afterEach(() => {
  w?.unmount()
  w = null
  vi.unstubAllGlobals()
})

function local(): { service: FakeService; urls: string[]; fetch: typeof fetch } {
  const service = new FakeService()
  service.hosted = false
  const urls: string[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    return service.fetch(input, init)
  }) as typeof fetch
  return { service, urls, fetch: f }
}

function expectLoopbackOnly(urls: string[], calls: FakeService['calls']): void {
  expect(urls.length).toBeGreaterThan(0)
  for (const u of urls) {
    expect(u, u).toMatch(/^\/api\/v1\//) // relative: the page's own origin, which is the loopback server
    expect(LOCAL_ROUTES.has(new URL(u, 'http://127.0.0.1').pathname), u).toBe(true)
  }
  expect(calls.some((c) => c.path === '/api/v1/instance' || c.path.startsWith('/api/v1/me') || c.path === '/api/v1/page')).toBe(false)
  expect(globalFetch).not.toHaveBeenCalled()
}

describe('the local editor', () => {
  it('at /edit, loads, edits, saves and previews through the loopback routes only, with the editor header on writes', async () => {
    const { service, urls, fetch } = local()
    w = mount(LinkInBioView, { props: { fetch, start: '/edit', hostname: '127.0.0.1' }, attachTo: document.body })
    await settle()
    expect(w.find('h2').text()).toBe('Edit your page')
    const name = w.find('#f-identity-displayName')
    expect((name.element as HTMLInputElement).value).toBe('Ada Example')
    // The handle is editable here (there is no account).
    expect(w.find('#f-identity-handle').element.tagName).toBe('INPUT')
    await name.setValue('Ada Local')
    await w.find('form.editor-form').trigger('submit')
    await settle()
    expect(service.draft.identity.displayName).toBe('Ada Local')
    const put = service.callsTo('PUT', '/api/v1/manifest')[0]!
    expect(put.headers['x-link-in-bio-editor']).toBe('1')
    expect(put.headers['x-link-in-bio-request']).toBe('1')
    // The preview is the unsaved document rendered by the backend, in a frame with no permissions.
    const frame = w.find('iframe.preview-frame')
    expect(frame.attributes('sandbox')).toBe('')
    expect(frame.attributes('src')).toBeUndefined()
    expect(frame.attributes('srcdoc')).toContain('Ada Local')
    await button(w, 'Refresh the preview').trigger('click')
    await settle()
    expectLoopbackOnly(urls, service.calls)
  })

  it('shows the backend’s issues next to their fields', async () => {
    const { urls, fetch, service } = local()
    w = mount(LinkInBioView, { props: { fetch, start: '/edit', hostname: 'localhost' }, attachTo: document.body })
    await settle()
    await w.find('#f-item-website-url').setValue('javascript:alert(1)')
    await w.find('form.editor-form').trigger('submit')
    await settle()
    expect(w.find('.issue-summary').text()).toContain('A link must start with https:// or mailto:.')
    expect(w.find('#f-item-website-url').attributes('aria-invalid')).toBe('true')
    expectLoopbackOnly(urls, service.calls)
  })

  it('is what / opens on a loopback host whose server is the loopback editor (it asks only that origin which API it serves)', async () => {
    const { urls, fetch, service } = local()
    w = mount(LinkInBioView, { props: { fetch, start: '/', hostname: '127.0.0.1' }, attachTo: document.body })
    await settle()
    expect(w.find('h2').text()).toBe('Edit your page')
    // The one question about the hosted app goes to the same loopback origin, and is answered "not here".
    expect(urls[0]).toBe('/api/v1/instance')
    expectLoopbackOnly(urls.slice(1), service.calls.slice(1))
  })
})
