// An in-memory stand-in for the Link in Bio service (the app API, the admin API and the loopback editor backend), for the component
// tests and the browser tests (e2e/open.ts answers `page.route` with it). It answers with the shapes crates/api/src/hosted/app.rs and
// admin.rs write and enforces what the app must get right: the request header on every write, the session, and a page document
// checked the way the parser reports it (issues by path).
//
// Test support only: nothing under src/ imports it, and scripts/check-dist.mjs fails the build if it reaches dist.

export interface Call {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  headers: Record<string, string>
}

export interface FakeReply {
  status: number
  json?: unknown
  text?: string
  contentType?: string
}

type Body = Record<string, any>

const NOW = '2026-11-16T12:00:00Z'
const b64url = (s: string) => Buffer.from(s).toString('base64url')
const ok = (json: unknown, status = 200): FakeReply => ({ status, json })
const none = (): FakeReply => ({ status: 204 })
const err = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): FakeReply => ({ status, json: { error, code, ...extra } })

export interface Issue {
  path: string
  code: string
  message: string
}

/** The page checks the app shows: a few of the parser's rules, with its paths and codes. */
export function checkDocument(doc: Body, handle: string | null): Issue[] {
  const issues: Issue[] = []
  const id = doc.identity ?? {}
  if (!id.displayName?.trim()) issues.push({ path: 'identity/displayName', code: 'missing', message: 'This is required.' })
  if (handle && id.handle !== handle) issues.push({ path: 'identity/handle', code: 'handle_mismatch', message: 'The handle must be your account’s handle.' })
  const link = (l: Body, path: string) => {
    if (!l.title?.trim()) issues.push({ path: `${path}/title`, code: 'missing', message: 'This is required.' })
    if (!l.url?.trim()) issues.push({ path: `${path}/url`, code: 'missing', message: 'Every link needs a web address.' })
    else if (!/^(https:\/\/|mailto:)/.test(l.url)) issues.push({ path: `${path}/url`, code: 'url_scheme', message: 'A link must start with https:// or mailto:.' })
  }
  ;(doc.items ?? []).forEach((item: Body, i: number) => {
    if (item.kind === 'group') {
      if (!item.title?.trim()) issues.push({ path: `items/${i}/title`, code: 'missing', message: 'This is required.' })
      ;(item.items ?? []).forEach((l: Body, j: number) => link(l, `items/${i}/items/${j}`))
    } else link(item, `items/${i}`)
  })
  ;(doc.contact ?? []).forEach((c: Body, i: number) => {
    if (!String(c.url ?? '').startsWith('mailto:')) issues.push({ path: `contact/${i}/url`, code: 'mailto_required', message: 'A contact is an email link (mailto:).' })
  })
  return issues
}

export const LIMITS = {
  manifestBytes: 65536, displayName: 64, handle: 30, bio: 160, pronouns: 24, linkTitle: 80, groupTitle: 80, linkDescription: 120,
  links: 60, groups: 10, id: 36, contacts: 4, support: 3, label: 40, urlBytes: 2048, reservedHandles: ['admin', 'app'],
  icons: ['github', 'mastodon', 'bluesky', 'email', 'website'],
}

export const THEME = {
  colorMode: ['system', 'light', 'dark'], season: ['none', 'spring', 'summer', 'autumn', 'winter'],
  accent: ['season', 'red', 'orange', 'yellow', 'green', 'blue', 'terracotta', 'moss', 'slate'], buttons: ['filled', 'outline', 'plain'],
  radius: ['xs', 'sm', 'md', 'lg'], density: ['comfortable', 'compact'], layout: ['list', 'cards'], font: ['sans', 'serif', 'rounded', 'mono'],
}

const fullTheme = { colorMode: 'system', season: 'none', accent: 'season', buttons: 'outline', radius: 'md', density: 'comfortable', layout: 'list', font: 'sans' }

export class FakeService {
  calls: Call[] = []
  /** Who is signed in to the app (null: nobody). */
  handle: string | null = null
  signup: 'closed' | 'invite' | 'open' = 'invite'
  /** The admin gate: signed in, the gate's 401/403, the console not configured (503), or the edge's HTML error page (502). */
  gate: 'ok' | 401 | 403 | 503 | 502 = 'ok'
  /** Answer the hosted routes (false: only the loopback editor's). */
  hosted = true
  free = false
  paidUntil: string | null = '2026-12-16T12:00:00Z'
  country: string | null = 'GB'
  published = true
  version = 3
  passkeys = [{ id: 'aa01', name: 'Laptop' }]
  wallets: string[] = []
  codesLeft = 10
  checkoutReads = 0
  /** How many reads of a checkout answer `open` before it is `paid`. */
  checkoutOpenReads = 1
  checkoutClient: Record<string, unknown> = { kind: 'chain-payments', sessionId: '0123456789abcdef0123456789abcdef', baseUrl: 'https://pay.example.org' }
  draft: Body = {
    schema: 1,
    identity: { kind: 'person', displayName: 'Ada Example', handle: 'ada', bio: 'Writes about examples.' },
    items: [
      { kind: 'link', id: 'website', title: 'My website', url: 'https://example.org/' },
      { kind: 'link', id: 'code', title: 'Code', url: 'https://code.example.org/ada', identity: true },
      { kind: 'group', id: 'writing', title: 'Writing', items: [{ kind: 'link', id: 'blog', title: 'Blog', url: 'https://blog.example.org/' }] },
    ],
    theme: fullTheme,
    contact: [{ label: 'Email', url: 'mailto:ada@example.org' }],
    meta: { lang: 'en', indexable: true },
  }
  reports: Body[] = [
    { id: 'r0000001-0000-4000-8000-000000000001', page: 'spammy', account: 'a0000002-0000-4000-8000-000000000002', url: 'https://bad.example.org/win', reason: 'fraud', details: 'Asks for card numbers.', contact: 'someone@example.org', status: 'open', createdAt: NOW, decidedAt: null, decidedBy: null, decision: null, statement: null },
    { id: 'r0000001-0000-4000-8000-000000000002', page: 'loud', account: 'a0000003-0000-4000-8000-000000000003', url: null, reason: 'harassment', details: '', contact: null, status: 'open', createdAt: NOW, decidedAt: null, decidedBy: null, decision: null, statement: null },
  ]
  appeals: Body[] = [
    { id: 'p0000001-0000-4000-8000-000000000001', account: 'a0000002-0000-4000-8000-000000000002', report: 'r0000001-0000-4000-8000-000000000001', text: 'The link was a joke.', status: 'open', createdAt: NOW, decidedAt: null, decidedBy: null, statement: null },
  ]
  blocklist: Body[] = [{ pattern: 'bad.example.org', kind: 'host', reason: 'phishing', addedBy: 'operator:op', addedAt: NOW }]
  invites: Body[] = [
    { id: 'i0000001-0000-4000-8000-000000000001', heldBy: null, selection: null, note: 'friends', createdBy: 'operator:op', createdAt: NOW, expiresAt: '2026-12-16T12:00:00Z', redeemedBy: null, redeemedAt: null, revokedAt: null },
  ]
  selections: Body[] = [{ id: 's0000001-0000-4000-8000-000000000001', name: 'Long-standing', criteria: { minAgeDays: 90, published: true, paid: null, inviteesInGoodStanding: true, tag: null }, createdBy: 'operator:op', createdAt: NOW }]
  nextId = 100
  refundAsked = false
  walletAddress: unknown = null
  /** Where the Open Payments wallet sends the browser to approve the payment. */
  openPaymentsRedirect = 'https://wallet.example/approve?id=1'
  finished: unknown = null
  refunds: Body[] = [
    { id: 'q0000001-0000-4000-8000-000000000001', account: 'a0000001-0000-4000-8000-000000000001', handle: 'ada', event: 'e0000001-0000-4000-8000-000000000002', provider: 'chain-payments', months: 1, amountPence: 300, paidAt: NOW, reason: 'I paid twice by mistake.', status: 'open', createdAt: NOW, refundReference: null, refundEvent: null, decidedBy: null, decidedAt: null, payment: { digest: '4JFuen7pDZCzqdRwUmB4oCwbeJ7Xqw5DqBsupvwyX1wb', payer: '0x' + 'a9'.repeat(32), coinType: '0xa1ec::usdc::USDC', amount: '3965894', method: 'sui-testnet:USDC', checkout: 'c0000001-0000-4000-8000-000000000009' } },
  ]

  private id(): string {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`
  }

  /** A `fetch` for component tests (relative URLs resolve against localhost). */
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, 'http://localhost')
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const body = typeof init?.body === 'string' ? init.body : undefined
    const r = this.respond((init?.method ?? 'GET').toUpperCase(), url.pathname + url.search, headers, body)
    if (r.status === 204) return new Response(null, { status: 204 })
    if (r.text !== undefined) return new Response(r.text, { status: r.status, headers: { 'content-type': r.contentType ?? 'text/html' } })
    return new Response(JSON.stringify(r.json ?? null), { status: r.status, headers: { 'content-type': 'application/json' } })
  }

  respond(method: string, pathAndQuery: string, headers: Record<string, string>, bodyText?: string): FakeReply {
    const url = new URL(pathAndQuery, 'http://localhost')
    const query = Object.fromEntries(url.searchParams.entries())
    let body: unknown
    try {
      body = bodyText ? JSON.parse(bodyText) : undefined
    } catch {
      body = bodyText
    }
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    this.calls.push({ method, path: url.pathname, query, body, headers: h })
    if (method !== 'GET' && h['x-link-in-bio-request'] !== '1') return err(403, 'forbidden', 'the request is missing its app header')
    const path = url.pathname
    if (path.startsWith('/api/v1/admin/')) return this.admin(method, path.slice('/api/v1/admin'.length), query, (body ?? {}) as Body)
    return this.app(method, path, query, (body ?? {}) as Body)
  }

  callsTo(method: string, path: string): Call[] {
    return this.calls.filter((c) => c.method === method && c.path === path)
  }

  private account() {
    return {
      id: 'a0000001-0000-4000-8000-000000000001', handle: this.handle ?? 'ada', status: 'active', free: this.free, paidUntil: this.paidUntil,
      entitled: this.free || !!this.paidUntil, country: this.country, createdAt: '2026-10-01T09:00:00Z', pageUrl: `https://${this.handle ?? 'ada'}.example.link/`,
      termsVersion: '2026-11', suspension: null,
    }
  }

  private session(): boolean {
    return this.handle !== null
  }

  private screening() {
    const urls: string[] = []
    for (const i of this.draft.items ?? []) {
      if (i.kind === 'group') for (const l of i.items) urls.push(l.url)
      else urls.push(i.url)
    }
    return urls.map((u, n) => ({ url: u, verdict: n === 0 ? 'clean' : n === 1 ? 'unchecked' : 'unknown', detail: null }))
  }

  private app(method: string, path: string, query: Record<string, string>, b: Body): FakeReply {
    // The loopback editor's routes (`link-in-bio serve --mode local`).
    if (path === '/api/v1/manifest' && method === 'GET') return this.hosted ? err(404, 'no_route', 'no such route') : ok(this.draft)
    if (path === '/api/v1/manifest' && method === 'PUT') {
      if (this.hosted) return err(404, 'no_route', 'no such route')
      const issues = checkDocument(b, null)
      if (issues.length) return { status: 422, json: { ok: false, errors: issues, warnings: [] } }
      this.draft = b
      return ok({ ok: true, errors: [], warnings: [] })
    }
    if (path === '/api/v1/preview' && method === 'POST') {
      if (this.hosted) return err(404, 'no_route', 'no such route')
      return { status: 200, text: `<!doctype html><title>${b.identity?.displayName ?? ''}</title><p>${b.identity?.displayName ?? ''}</p>` }
    }
    if (path === '/api/v1/theme/options') return this.hosted ? { status: 404, text: '<!doctype html><title>Not found</title>' } : ok({ options: THEME, contrast: [], textMin: 7 })
    if (path === '/api/v1/avatar' && method === 'POST') return ok({ ok: true, avatar: 'avatar-0123456789ab.png', bytes: 1200, mime: 'image/png' })
    if (path === '/api/v1/limits') return ok(LIMITS)
    if (!this.hosted) return { status: 404, text: '<!doctype html><title>Not found</title>' }

    if (path === '/api/v1/instance') {
      return ok({
        product: 'Example Links', version: '0.0.1', appHost: 'app.example.link', pagesDomain: 'example.link', signup: this.signup, thirdPartyPages: true,
        termsVersion: '2026-11', minimumAge: 18, pricePence: 300, currency: 'GBP', billingProviders: ['manual', 'chain-payments'], customDomains: true,
        federation: true, authenticators: ['passkey', 'sui-wallet', 'recovery-code'], suiNetwork: 'testnet',
      })
    }
    if (path === '/api/v1/signup/start' && method === 'POST') {
      if (!b.ageConfirmed) return err(422, 'unprocessable', 'You must be 18 or over to have an account.')
      if (!b.termsAccepted || b.termsVersion !== '2026-11') return err(422, 'unprocessable', 'Accept the current terms to continue.')
      if (this.signup === 'invite' && !b.invite) return err(422, 'unprocessable', 'An invite code is needed to sign up.')
      if (b.handle === 'taken') return err(409, 'conflict', 'That handle is taken or too close to one that exists.')
      this.pendingHandle = b.handle
      if (b.method === 'sui-wallet') return ok({ challenge: 'c'.repeat(32), message: 'app.example.link wants you to sign in with your Sui account' })
      return ok({
        challenge: 'c'.repeat(32),
        options: {
          publicKey: {
            rp: { id: 'localhost', name: 'Example Links' },
            user: { id: b64url('user-0001'), name: b.handle, displayName: b.handle },
            challenge: b64url('a-challenge-of-thirty-two-bytes!'),
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            timeout: 60000,
            attestation: 'none',
            authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
            extensions: { credProps: true },
          },
        },
      })
    }
    if (path === '/api/v1/signup/finish' && method === 'POST') {
      if (!b.credential && !b.signature) return err(400, 'bad_request', 'send either a credential or a signature')
      if (b.credential && !(b.credential.response?.attestationObject && b.credential.rawId)) return err(422, 'unprocessable', 'The passkey could not be verified.')
      this.handle = this.pendingHandle ?? 'ada'
      this.draft = { ...this.draft, identity: { ...this.draft.identity, handle: this.handle } }
      return ok({ account: this.account(), recoveryCodes: Array.from({ length: 10 }, (_, i) => `CODE-${i}AAA-BBBB`) })
    }
    if (path === '/api/v1/login/passkey/start') {
      return ok({ challenge: 'd'.repeat(32), options: { publicKey: { challenge: b64url('another-challenge-32-bytes-long!'), rpId: 'localhost', allowCredentials: [], userVerification: 'required', timeout: 60000 } } })
    }
    if (path === '/api/v1/login/passkey/finish') {
      this.handle = 'ada'
      return ok({ account: this.account() })
    }
    if (path === '/api/v1/login/wallet/start') return ok({ challenge: 'e'.repeat(32), message: 'Sign in to Example Links.' })
    if (path === '/api/v1/login/wallet/finish') {
      if (!b.signature) return err(422, 'unprocessable', 'That did not sign you in.')
      this.handle = 'ada'
      return ok({ account: this.account() })
    }
    if (path === '/api/v1/login/recovery') {
      if (b.code !== 'GOOD-CODE') return err(422, 'unprocessable', 'That did not sign you in.')
      this.handle = b.handle
      this.codesLeft = 2
      return ok({ account: this.account(), recoveryCodesLeft: 2 })
    }
    if (path === '/api/v1/logout') {
      this.handle = null
      return none()
    }
    if (path === '/api/v1/reports' && method === 'POST') {
      if (!b.page || !b.reason) return err(422, 'unprocessable', 'Choose a reason from the list.')
      return ok({ report: this.id() }, 201)
    }
    if (path.startsWith('/api/v1/assets/')) return { status: 404, json: { error: 'not found', code: 'not_found' } }

    if (!this.session()) return err(401, 'unauthorized', 'sign in first')
    if (path === '/api/v1/me' && method === 'GET') return ok({ ...this.account(), passkeys: this.passkeys, wallets: this.wallets, recoveryCodesLeft: this.codesLeft })
    if (path === '/api/v1/me' && method === 'DELETE') {
      if (b.confirm !== this.handle) return err(422, 'unprocessable', 'Type your handle to confirm.')
      this.handle = null
      return none()
    }
    if (path === '/api/v1/me/country') {
      this.country = b.country
      return none()
    }
    if (path === '/api/v1/me/invites') return ok({ codes: [{ code: 'FRIEND-CODE-0001', expiresAt: '2026-12-16T12:00:00Z' }], redeemed: 1 })
    if (path === '/api/v1/me/statements') {
      return ok({
        statements: [{ report: 'r0000001-0000-4000-8000-000000000009', reason: 'spam', decision: 'link hidden', statement: 'The link led to a page of adverts only.', decidedAt: NOW }],
        appeals: [],
      })
    }
    if (path === '/api/v1/appeals') return ok({ appeal: this.id() }, 201)
    if (path === '/api/v1/me/recovery-codes') return ok({ recoveryCodes: Array.from({ length: 10 }, (_, i) => `NEW-${i}AAA-BBBB`) })
    if (path === '/api/v1/me/passkeys/start') return this.app('POST', '/api/v1/signup/start', query, { handle: this.handle, ageConfirmed: true, termsAccepted: true, termsVersion: '2026-11', invite: 'x', method: 'passkey' })
    if (path === '/api/v1/me/passkeys/finish') {
      this.passkeys.push({ id: 'bb02', name: b.name ?? 'Passkey' })
      return none()
    }
    if (path.startsWith('/api/v1/me/passkeys/') && method === 'DELETE') {
      if (this.passkeys.length + this.wallets.length <= 1) return err(409, 'conflict', 'Keep at least one way to sign in.')
      this.passkeys = this.passkeys.filter((p) => p.id !== path.split('/').pop())
      return none()
    }
    if (path === '/api/v1/me/wallets/start') return ok({ challenge: 'f'.repeat(32), message: 'Link this wallet.' })
    if (path === '/api/v1/me/wallets/finish') {
      this.wallets.push(`0x${'a'.repeat(64)}`)
      return none()
    }
    if (path === '/api/v1/page' && method === 'GET') {
      return ok({ draft: this.draft, published: this.published, version: this.version, updatedAt: NOW, publishedAt: this.published ? NOW : null, url: `https://${this.handle}.example.link/`, issues: [], screening: this.screening(), changed: true })
    }
    if (path === '/api/v1/page' && method === 'PUT') {
      const issues = checkDocument(b, this.handle)
      if (issues.length) return err(422, 'invalid_page', 'the page document has problems', { issues })
      this.draft = b
      return ok({ saved: true, warnings: [] })
    }
    if (path === '/api/v1/page/preview') return { status: 200, text: `<!doctype html><title>${this.draft.identity.displayName}</title><h1>${this.draft.identity.displayName}</h1>` }
    if (path === '/api/v1/page/publish') {
      if (!this.free && !this.paidUntil) return err(409, 'conflict', 'Buy a paid period to publish your page.')
      this.published = true
      this.version++
      return ok({ version: this.version, url: `https://${this.handle}.example.link/`, hidden: [], online: true })
    }
    if (path === '/api/v1/page/unpublish') {
      this.published = false
      return none()
    }
    if (path === '/api/v1/page/versions') return ok({ versions: [{ version: 3, at: NOW }, { version: 2, at: '2026-11-10T08:00:00Z' }] })
    if (path.startsWith('/api/v1/page/versions/')) return none()
    if (path === '/api/v1/page/avatar') return ok({ avatar: `sha256:${'ab'.repeat(32)}`, url: `/api/v1/assets/${'ab'.repeat(32)}.png` })
    if (path === '/api/v1/billing') {
      return ok({
        free: this.free, paidUntil: this.paidUntil, entitled: !!this.paidUntil, pricePence: 300, currency: 'GBP',
        offers: [
          { id: 'chain-payments:sui-testnet:SUI', provider: 'chain-payments', label: 'SUI', seller: 'operator', fees: { fixedPence: 0, percentBps: 100 }, recurring: false, minMonths: 1, maxMonths: 12 },
          { id: 'square:card', provider: 'square', label: 'Card', seller: 'operator', fees: { fixedPence: 25, percentBps: 175 }, recurring: false, minMonths: 4, maxMonths: 12 },
        ],
        notes: [],
        events: [
          { id: 'e0000001-0000-4000-8000-000000000001', provider: 'chain-payments', kind: 'purchase', months: 3, amountPence: 900, at: '2026-09-16T12:00:00Z', paidUntil: '2026-12-16T12:00:00Z', unapplied: false, refundableUntil: null, refundRequest: null },
          { id: 'e0000001-0000-4000-8000-000000000002', provider: 'chain-payments', kind: 'purchase', months: 1, amountPence: 300, at: '2026-11-10T12:00:00Z', paidUntil: '2027-01-16T12:00:00Z', unapplied: true, refundableUntil: '2026-12-10T12:00:00Z', refundRequest: this.refundAsked ? { id: 'q1', status: 'open', refundReference: null, at: NOW, decidedAt: null } : null },
        ],
      })
    }
    if (/^\/api\/v1\/billing\/events\/[^/]+\/refund-request$/.test(path) && method === 'POST') {
      this.refundAsked = true
      return ok({ refundRequest: 'q1', status: 'open', event: path.split('/')[5] }, 201)
    }
    if (/^\/api\/v1\/billing\/checkouts\/[^/]+\/open-payments$/.test(path) && method === 'POST') {
      this.walletAddress = b.walletAddress
      return ok({ kind: 'open-payments', step: 'redirect', redirect: this.openPaymentsRedirect, wallet: 'https://wallet.example/alice', debitAmount: { value: '600', assetCode: 'GBP', assetScale: 2 }, receiveAmount: { value: '600', assetCode: 'GBP', assetScale: 2 } })
    }
    if (/^\/api\/v1\/billing\/checkouts\/[^/]+\/open-payments\/finish$/.test(path) && method === 'POST') {
      this.finished = b
      return ok({ checkout: path.split('/')[5], status: 'open', outgoingPayment: 'https://wallet.example/outgoing/1' })
    }
    if (path === '/api/v1/billing/checkouts' && method === 'POST') {
      this.checkoutReads = 0
      return ok({ checkout: 'c0000001-0000-4000-8000-000000000001', amountPence: 300 * b.months, client: this.checkoutClient })
    }
    if (path.startsWith('/api/v1/billing/checkouts/')) {
      this.checkoutReads++
      const paid = this.checkoutReads > this.checkoutOpenReads
      if (paid) this.paidUntil = '2027-01-16T12:00:00Z'
      return ok({ checkout: path.split('/').pop(), status: paid ? 'paid' : 'open', months: 1, paidUntil: this.paidUntil })
    }
    if (path === '/api/v1/domains' && method === 'GET') {
      return ok({ enabled: true, domains: [{ hostname: 'links.example.org', status: 'pending', verifiedAt: null, record: { name: '_link-in-bio.links.example.org', type: 'TXT', value: '0123456789abcdef0123456789abcdef' } }] })
    }
    if (path === '/api/v1/domains' && method === 'POST') return ok({ hostname: b.hostname, record: { name: `_link-in-bio.${b.hostname}`, type: 'TXT', value: 'f'.repeat(32) } })
    if (path.startsWith('/api/v1/domains/')) return none()
    return err(404, 'no_route', 'no such route')
  }

  pendingHandle: string | null = null

  private admin(method: string, path: string, query: Record<string, string>, b: Body): FakeReply {
    if (this.gate === 503) return err(503, 'unavailable', 'the console is not configured')
    if (this.gate === 502) return { status: 502, text: '<!doctype html><title>502 Bad Gateway</title>' }
    if (this.gate === 401) return err(401, 'unauthorized', 'sign in first')
    if (this.gate === 403) return err(403, 'forbidden', 'not an operator of Link in Bio')
    const row = (id: string, handle: string, over: Body = {}) => ({
      id, handle, status: 'active', suspensionKind: null, suspensionReason: null, suspendedUntil: null, free: false, operator: false, mayShareInvites: true,
      invitedBy: null, tags: [], country: 'GB', paidUntil: '2026-12-16T12:00:00Z', createdAt: '2026-08-01T09:00:00Z', ...over,
    })
    const accounts = [row('a0000001-0000-4000-8000-000000000001', 'ada'), row('a0000002-0000-4000-8000-000000000002', 'spammy', { invitedBy: 'a0000001-0000-4000-8000-000000000001', mayShareInvites: false })]
    if (path === '/me') return ok({ subject: 'op-subject', name: 'op@example.org' })
    if (path === '/overview') {
      return ok({
        accounts: { active: 12, suspended: 1, free: 3, paid: 8 }, pagesPublished: 10, reports: { open: this.reports.filter((r) => r.status === 'open').length, openOver24h: 0 },
        appealsOpen: 1, links: { flagged: 2, unknown: 1 }, storageBytes: 204800, checkoutsOpen: 1,
        switches: { signup: 'invite', thirdPartyPages: true, billingProviders: ['manual', 'chain-payments'], customHostnameCap: 10, webRisk: false, federation: true, bankFeeds: ['wise'] },
        bankFeeds: [{ feed: 'wise', polledAt: NOW, lastError: null, creditsSeen: 4 }],
      })
    }
    if (path === '/accounts') return ok({ accounts: accounts.filter((a) => a.handle.startsWith(query.q ?? '')) })
    const m = /^\/accounts\/([^/]+)(\/\w+)?$/.exec(path)
    if (m) {
      const a = accounts.find((x) => x.id === m[1])
      if (!a) return err(404, 'not_found', 'not found')
      if (!m[2]) {
        return ok({
          account: a, page: { published: true, version: 2, publishedAt: NOW, document: null },
          invitees: accounts.filter((x) => x.invitedBy === a.id), invites: [], billing: [{ provider: 'manual', kind: 'grant', months: 1, amountPence: 0, at: NOW }],
          domains: [], audit: [{ at: NOW, actor: 'operator:op', action: 'flags', details: { free: false } }],
        })
      }
      if (m[2] === '/grant') return ok({ paidUntil: '2027-01-16T12:00:00Z' })
      return none()
    }
    if (path === '/invites' && method === 'GET') return ok({ invites: this.invites })
    if (path === '/invites' && method === 'POST') {
      const codes = b.heldBy ? [] : Array.from({ length: b.count }, (_, i) => `NEW-INVITE-${i}`)
      return ok({ codes, issued: b.count, expiresAt: '2026-12-16T12:00:00Z' })
    }
    if (path.startsWith('/invites/')) return none()
    if (path === '/selections' && method === 'GET') return ok({ selections: this.selections })
    if (path === '/selections' && method === 'POST') return ok({ id: this.id() }, 201)
    if (/^\/selections\/[^/]+\/matches$/.test(path)) return ok({ accounts })
    if (/^\/selections\/[^/]+\/issue$/.test(path)) return ok({ accounts: 1, codes: b.perAccount, expiresAt: NOW })
    if (path.startsWith('/selections/')) return none()
    if (path === '/reports') return ok({ reports: this.reports.filter((r) => r.status === (query.status ?? 'open')) })
    const d = /^\/reports\/([^/]+)\/decide$/.exec(path)
    if (d) {
      const r = this.reports.find((x) => x.id === d[1])
      if (!r) return err(404, 'not_found', 'not found')
      if (r.status !== 'open') return err(409, 'conflict', 'That report is already decided.')
      Object.assign(r, { status: b.status, decision: b.decision, statement: b.statement ?? null, decidedAt: NOW, decidedBy: 'operator:op', hidden: b.hideLink })
      return none()
    }
    if (path === '/appeals') return ok({ appeals: this.appeals.filter((a) => a.status === (query.status ?? 'open')) })
    const ad = /^\/appeals\/([^/]+)\/decide$/.exec(path)
    if (ad) {
      const a = this.appeals.find((x) => x.id === ad[1])
      if (a) Object.assign(a, { status: b.status, statement: b.statement, decidedAt: NOW, decidedBy: 'operator:op' })
      return none()
    }
    if (path === '/refund-requests' && method === 'GET') return ok({ requests: this.refunds.filter((r) => r.status === (query.status ?? 'open')) })
    const rf = /^\/refund-requests\/([^/]+)\/refunded$/.exec(path)
    if (rf && method === 'POST') {
      const r = this.refunds.find((x) => x.id === rf[1])
      if (!r) return err(404, 'not_found', 'no such request')
      Object.assign(r, { status: 'refunded', refundReference: b.reference, decidedBy: 'operator:op', decidedAt: NOW })
      return ok({ request: r, paidUntil: '2026-12-16T12:00:00Z' })
    }
    if (path === '/blocklist' && method === 'GET') return ok({ entries: this.blocklist })
    if (path === '/blocklist' && method === 'POST') {
      this.blocklist.push({ ...b, addedBy: 'operator:op', addedAt: NOW })
      return none()
    }
    if (path === '/blocklist' && method === 'DELETE') {
      this.blocklist = this.blocklist.filter((x) => x.pattern !== query.pattern)
      return none()
    }
    if (path === '/links') return none()
    if (path === '/audit') return ok({ entries: [{ id: 1, at: NOW, actor: 'operator:op', action: 'report-decided', subject: 'r0000001', details: { status: 'actioned' } }] })
    return err(404, 'no_route', 'no such route')
  }
}
