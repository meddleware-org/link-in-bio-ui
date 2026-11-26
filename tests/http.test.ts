// Tests of the HTTP layer (src/api/http.ts), the typed APIs over it and the hosted editor source: the request header on every write, same-origin relative paths only, the service's error shape,
// the timeout, and the loopback editor's own header.
import { describe, expect, it } from 'vitest'
import { adminApi } from '../src/api/admin.js'
import { appApi } from '../src/api/app.js'
import { ApiError, describeError } from '../src/api/errors.js'
import { createHttp, DEFAULT_TIMEOUT_MS, url } from '../src/api/http.js'
import { hostedSource } from '../src/editor/source.js'

/** A fetch response with this status, body and content type. */
function reply(status: number, body: unknown, type = 'application/json'): Response {
  return new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } })
}

/** An HTTP layer over a mocked fetch, with the calls it made. */
function client(f: (url: string, init: RequestInit) => Response = () => reply(200, {})) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchMock = (async (u: string, init: RequestInit) => {
    calls.push({ url: u, init })
    return f(u, init)
  }) as unknown as typeof fetch
  return { http: createHttp({ fetch: fetchMock }), calls }
}

const headers = (init: RequestInit) => Object.fromEntries(Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))

// The HTTP layer's rules.
describe('the HTTP layer', () => {
  // Sends X-Link-In-Bio-Request on every write and never on a read, same-origin, with no token.
  it('sends X-Link-In-Bio-Request on every write and never on a read, same-origin, with no token', async () => {
    const { http, calls } = client()
    await http.get('/api/v1/me')
    await http.post('/api/v1/page/publish')
    await http.put('/api/v1/page', { schema: 1 })
    await http.del('/api/v1/me', { confirm: 'ada' })
    await http.request('POST', '/api/v1/page/avatar', { body: new Blob(['x'], { type: 'image/png' }), contentType: 'image/png' })
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['GET', '/api/v1/me'],
      ['POST', '/api/v1/page/publish'],
      ['PUT', '/api/v1/page'],
      ['DELETE', '/api/v1/me'],
      ['POST', '/api/v1/page/avatar'],
    ])
    for (const { init } of calls) {
      expect(init.credentials).toBe('same-origin')
      expect(init.redirect).toBe('manual')
      const h = headers(init)
      expect(h['x-link-in-bio-request'], init.method).toBe(init.method === 'GET' ? undefined : '1')
      expect(h).not.toHaveProperty('authorization')
    }
    expect(headers(calls[4]!.init)['content-type']).toBe('image/png')
    expect(calls[2]!.init.body).toBe('{"schema":1}')
  })

  // Adds the loopback editor header when asked, on writes only.
  it('adds the loopback editor header when asked, on writes only', async () => {
    const calls: RequestInit[] = []
    const http = createHttp({ fetch: (async (_u: string, init: RequestInit) => (calls.push(init), reply(200, {}))) as unknown as typeof fetch, writeHeaders: { 'X-Link-In-Bio-Editor': '1' } })
    await http.get('/api/v1/manifest')
    await http.put('/api/v1/manifest', {})
    expect(headers(calls[0]!)['x-link-in-bio-editor']).toBeUndefined()
    expect(headers(calls[1]!)).toMatchObject({ 'x-link-in-bio-editor': '1', 'x-link-in-bio-request': '1' })
  })

  // Builds only relative /api/ URLs, leaving empty query values out.
  it('builds only relative /api/ URLs, leaving empty query values out', () => {
    expect(url('/api/v1/admin/accounts', { q: '', offset: 0, x: undefined, y: null, z: 'a b' })).toBe('/api/v1/admin/accounts?offset=0&z=a+b')
    expect(() => url('https://elsewhere.example.org/api/v1/me')).toThrow()
    expect(() => url('//elsewhere.example.org/api')).toThrow()
  })

  // Carries the service error {error, code, issues} in one error type.
  it('carries the service error {error, code, issues} in one error type', async () => {
    const issues = [{ path: 'items/0/url', code: 'url_scheme', message: 'A link must start with https:// or mailto:.' }]
    const { http } = client(() => reply(422, { error: 'the page document has problems', code: 'invalid_page', issues }))
    const e = (await http.put('/api/v1/page', {}).catch((x: unknown) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect([e.status, e.code, e.message]).toEqual([422, 'invalid_page', 'the page document has problems'])
    expect(e.issues).toEqual(issues)
  })

  // Reads the loopback editor’s {ok, errors} and {ok, error} answers into the same error type.
  it('reads the loopback editor’s {ok, errors} and {ok, error} answers into the same error type', async () => {
    const errors = [{ path: 'identity/displayName', code: 'missing', message: 'This is required.' }]
    let { http } = client(() => reply(422, { ok: false, errors, warnings: [] }))
    const a = (await http.put('/api/v1/manifest', {}).catch((x: unknown) => x)) as ApiError
    expect([a.code, a.issues]).toEqual(['invalid_page', errors])
    ;({ http } = client(() => reply(422, { ok: false, error: 'not a picture' })))
    const b = (await http.post('/api/v1/avatar').catch((x: unknown) => x)) as ApiError
    expect([b.code, b.message, b.issues]).toEqual([null, 'not a picture', []])
  })

  // Treats a redirect or an HTML page where JSON belongs as not signed in, and no answer as status 0.
  it('treats a redirect or an HTML page where JSON belongs as not signed in, and no answer as status 0', async () => {
    for (const make of [() => ({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() }) as unknown as Response, () => reply(302, '', 'text/html'), () => reply(200, '<!doctype html><title>Sign in</title>', 'text/html')]) {
      const { http } = client(make)
      const e = (await http.get('/api/v1/admin/me').catch((x: unknown) => x)) as ApiError
      expect(e.signedOut).toBe(true)
    }
    const { http: edge } = client(() => reply(502, '<!doctype html><title>502 Bad Gateway</title>', 'text/html'))
    const bad = (await edge.get('/api/v1/admin/me').catch((x: unknown) => x)) as ApiError
    expect([bad.status, bad.signedOut]).toEqual([502, false])
    const http = createHttp({ fetch: (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch })
    const e = (await http.get('/api/v1/me').catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(0)
    expect(describeError(e)).toMatch(/could not be reached/)
  })

  // Gives every request a deadline: a server that never answers ends as "could not be reached".
  it('gives every request a deadline: a server that never answers ends as "could not be reached"', async () => {
    const seen: Array<AbortSignal | null | undefined> = []
    // A fetch that never answers on its own, only to its signal (as the browser's does).
    const stalled = ((_u: string, init: RequestInit) => {
      seen.push(init.signal)
      return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal!.reason)))
    }) as unknown as typeof fetch
    const http = createHttp({ fetch: stalled, timeoutMs: 20 })
    const e = (await http.post('/api/v1/page/publish').catch((x: unknown) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(0)
    expect(seen[0]).toBeInstanceOf(AbortSignal)
    // The default applies when none is given.
    const { http: plain, calls } = client()
    await plain.get('/api/v1/me')
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000)
  })

  // Returns text when asked (the local preview) and nothing for a 204.
  it('returns text when asked (the local preview) and nothing for a 204', async () => {
    let { http } = client(() => reply(200, '<!doctype html><p>hi</p>', 'text/html'))
    expect(await http.request('POST', '/api/v1/preview', { json: {}, text: true })).toBe('<!doctype html><p>hi</p>')
    ;({ http } = client(() => reply(204, null)))
    expect(await http.post('/api/v1/logout')).toBeUndefined()
  })

  // Describes errors in plain words, passing on the service’s own sentence where a person can act on it.
  it('describes errors in plain words, passing on the service’s own sentence where a person can act on it', () => {
    expect(describeError(new ApiError(409, 'conflict', 'That handle is taken or too close to one that exists.'))).toBe('That handle is taken or too close to one that exists.')
    expect(describeError(new ApiError(500, 'internal', 'stack trace here'))).not.toContain('stack')
    expect(describeError(new ApiError(503, 'unavailable', 'the database is unavailable'))).not.toContain('database')
    expect(describeError(new Error('boom'))).not.toContain('boom')
  })
})

describe('the typed API', () => {
  // Calls each app route with its method, path and body.
  it('calls each app route with its method, path and body', async () => {
    const { http, calls } = client(() => reply(200, {}))
    const api = appApi(http)
    await api.signupStart({ handle: 'ada', ageConfirmed: true, termsAccepted: true, termsVersion: 'v1', method: 'passkey' })
    await api.passkeyLoginStart()
    await api.passkeyLoginStart('ada')
    await api.walletLoginStart('0xabc')
    await api.recoveryLogin({ handle: 'ada', code: 'X' })
    await api.passkeyRemove('aa/01')
    await api.walletUnlink('0xabc')
    await api.restore(4)
    await api.createCheckout('chain-payments:sui-testnet:SUI', 3)
    await api.checkout('c-1')
    await api.removeDomain('links.example.org')
    await api.report({ page: 'ada', reason: 'spam', details: '' })
    await api.deleteMe('ada')
    expect(calls.map((c) => `${c.init.method} ${c.url} ${c.init.body ?? ''}`)).toEqual([
      'POST /api/v1/signup/start {"handle":"ada","ageConfirmed":true,"termsAccepted":true,"termsVersion":"v1","method":"passkey"}',
      'POST /api/v1/login/passkey/start {}',
      'POST /api/v1/login/passkey/start {"handle":"ada"}',
      'POST /api/v1/login/wallet/start {"address":"0xabc"}',
      'POST /api/v1/login/recovery {"handle":"ada","code":"X"}',
      'DELETE /api/v1/me/passkeys/aa%2F01 ',
      'DELETE /api/v1/me/wallets/0xabc ',
      'POST /api/v1/page/versions/4/restore {}',
      'POST /api/v1/billing/checkouts {"method":"chain-payments:sui-testnet:SUI","months":3}',
      'GET /api/v1/billing/checkouts/c-1 ',
      'DELETE /api/v1/domains/links.example.org ',
      'POST /api/v1/reports {"page":"ada","reason":"spam","details":""}',
      'DELETE /api/v1/me {"confirm":"ada"}',
    ])
  })

  // Calls the admin routes under /api/v1/admin with the field names the service reads.
  it('calls the admin routes under /api/v1/admin with the field names the service reads', async () => {
    const { http, calls } = client(() => reply(200, {}))
    const api = adminApi(http)
    await api.accounts('ad')
    await api.issue({ count: 3, heldBy: 'a-1', expiresInDays: 30 })
    await api.issueToSelection('s-1', { perAccount: 2 })
    await api.decideReport('r-1', { status: 'actioned', decision: 'hidden', hideLink: true })
    await api.decideAppeal('p-1', { status: 'upheld', statement: 'ok', reinstate: true })
    await api.unblock('bad.example.org')
    await api.linkVerdict({ url: 'https://bad.example.org/', verdict: null })
    await api.audit()
    expect(calls.map((c) => `${c.init.method} ${c.url} ${c.init.body ?? ''}`)).toEqual([
      'GET /api/v1/admin/accounts?q=ad ',
      'POST /api/v1/admin/invites {"count":3,"heldBy":"a-1","expiresInDays":30}',
      'POST /api/v1/admin/selections/s-1/issue {"perAccount":2}',
      'POST /api/v1/admin/reports/r-1/decide {"status":"actioned","decision":"hidden","hideLink":true}',
      'POST /api/v1/admin/appeals/p-1/decide {"status":"upheld","statement":"ok","reinstate":true}',
      'DELETE /api/v1/admin/blocklist?pattern=bad.example.org ',
      'PUT /api/v1/admin/links {"url":"https://bad.example.org/","verdict":null}',
      'GET /api/v1/admin/audit ',
    ])
  })
})

describe('the hosted editor source', () => {
  // Passes the uploaded picture’s URL on only as a path on this site or an https URL.
  it('passes the uploaded picture’s URL on only as a path on this site or an https URL', async () => {
    const answer = (url: unknown) => createHttp({ fetch: (async () => reply(200, { avatar: 'sha256:ab', url })) as unknown as typeof fetch })
    const upload = (url: unknown) => hostedSource(answer(url)).uploadAvatar(new Blob(['x'], { type: 'image/png' }))
    expect((await upload('/api/v1/assets/ab.png')).url).toBe('/api/v1/assets/ab.png')
    expect((await upload('https://cdn.example.org/ab.png')).url).toBe('https://cdn.example.org/ab.png')
    for (const bad of ['javascript:alert(1)', '//evil.example/x.png', 'data:text/html,<script>1</script>', '', null]) {
      expect((await upload(bad)).url, String(bad)).toBeNull()
    }
  })
})
