// The views against the fake service: the hosted editor (issues next to fields, the sandboxed preview), each kind of checkout, the
// report form, the console's gate and its reports queue, and sign-up's one-time recovery codes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import LinkInBioView from '../src/LinkInBioView.vue'
import CheckoutPanel from '../src/components/CheckoutPanel.vue'
import RecoveryCodes from '../src/components/RecoveryCodes.vue'
import { planCheckout } from '../src/lib/checkout.js'
import { goTo } from '../src/lib/navigate.js'
import { FakeService } from './support/fake-service.js'
import { button, mountWithApp, preload, settle } from './support/mount.js'

// The Chain Payments kit is a sibling package with its own tests; here it is a stand-in that reports its props and can say "paid".
// The test window cannot navigate: the console's sign-out hands its destination to this stand-in.
vi.mock('../src/lib/navigate.js', () => ({ goTo: vi.fn() }))
vi.mock('@meddleware/chain-payments-kit', () => ({
  ChainCheckout: defineComponent({
    props: { sessionId: String, baseUrl: String, signAndExecute: Function, level: Number },
    emits: ['paid', 'failed'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: 'kit', 'data-session': props.sessionId, 'data-base': props.baseUrl }, [
          h('button', { type: 'button', onClick: () => emit('paid', { digest: 'D' }) }, 'Kit pays'),
          h('button', { type: 'button', onClick: () => emit('failed', 'rejected') }, 'Kit rejected'),
          h('button', { type: 'button', onClick: () => emit('failed', 'something-new') }, 'Kit fails oddly'),
        ])
    },
  }),
}))

let w: VueWrapper | null = null
beforeEach(async () => {
  await preload()
})
afterEach(() => {
  w?.unmount()
  w = null
})

/** Mount the whole view at a starting path against a fake service. */
function open(start: string, service = new FakeService()) {
  w = mount(LinkInBioView, { props: { fetch: service.fetch as typeof fetch, start, hostname: 'app.example.link' }, attachTo: document.body })
  return service
}

const writesCarryTheHeader = (s: FakeService) => {
  for (const c of s.calls.filter((x) => x.method !== 'GET')) expect(c.headers['x-link-in-bio-request'], `${c.method} ${c.path}`).toBe('1')
}

// The signed-in editor: saving, refused fields and moving links.
describe('the hosted editor', () => {
  // Saves the draft, and shows refused fields with the service’s words next to them and in a summary.
  it('saves the draft, and shows refused fields with the service’s words next to them and in a summary', async () => {
    const s = new FakeService()
    s.handle = 'ada'
    open('/', s)
    await settle()
    expect(w!.find('h2').text()).toBe('Your page')
    // The handle is the account's: shown, not editable.
    expect(w!.find('#f-identity-handle').element.tagName).toBe('P')
    const frame = w!.find('iframe.preview-frame')
    expect(frame.attributes('sandbox')).toBe('')
    expect(frame.attributes('src')).toMatch(/^\/api\/v1\/page\/preview\?v=\d+$/)
    // Screening of each link, in words.
    expect(w!.text()).toContain('Checked: no problem found')
    expect(w!.text()).toContain('Not checked yet: checked when you publish')

    await w!.find('#f-identity-displayName').setValue('')
    await w!.find('#f-item-code-url').setValue('http://code.example.org/ada')
    await w!.find('form.editor-form').trigger('submit')
    await settle()
    const summary = w!.find('.issue-summary')
    expect(summary.text()).toContain('This is required.')
    expect(summary.text()).toContain('A link must start with https:// or mailto:.')
    expect(summary.find('a[href="#f-item-code-url"]').exists()).toBe(true)
    expect(w!.find('#f-item-code-url').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(summary.element)

    await w!.find('#f-identity-displayName').setValue('Ada E.')
    await w!.find('#f-item-code-url').setValue('https://code.example.org/ada')
    await w!.find('form.editor-form').trigger('submit')
    await settle()
    expect(w!.find('.issue-summary').exists()).toBe(false)
    expect(s.draft.identity.displayName).toBe('Ada E.')
    expect(s.draft.items[1].url).toBe('https://code.example.org/ada')
    writesCarryTheHeader(s)
  })

  // Moves a link with its buttons and saves the new order.
  it('moves a link with its buttons and saves the new order', async () => {
    const s = new FakeService()
    s.handle = 'ada'
    open('/', s)
    await settle()
    await w!.find('#down-website').trigger('click')
    await settle()
    expect(w!.text()).toContain('Moved “My website” down: now 2 of 3.')
    expect(w!.find('#up-code').attributes('disabled')).toBeDefined()
    await w!.find('form.editor-form').trigger('submit')
    await settle()
    expect(s.draft.items.map((i: { id: string }) => i.id)).toEqual(['code', 'website', 'writing'])
  })
})

// Each kind of checkout the billing view can show.
describe('a checkout', () => {
  const panel = (client: Record<string, unknown>, service = new FakeService()) => {
    service.handle = 'ada'
    const m = mountWithApp(CheckoutPanel, { checkoutId: 'c0000001-0000-4000-8000-000000000001', plan: planCheckout(client as never), pollMs: 1 }, service)
    w = m.w
    return m
  }

  // Chain Payments: renders the kit with its session, then follows the checkout to paid.
  it('Chain Payments: renders the kit with its session, then follows the checkout to paid', async () => {
    const { service } = panel({ kind: 'chain-payments', sessionId: 'cs_1', baseUrl: 'https://pay.example.org' })
    await settle()
    const kit = w!.find('.kit')
    expect([kit.attributes('data-session'), kit.attributes('data-base')]).toEqual(['cs_1', 'https://pay.example.org/'])
    await button(w!, 'Kit pays').trigger('click')
    await settle(12)
    expect(service.checkoutReads).toBe(2)
    expect(w!.text()).toContain('Paid. Your page is paid until')
  })

  // Chain Payments: a payment that did not count is the kit’s to explain; the panel never shows the bare reason code.
  it('Chain Payments: a payment that did not count is the kit’s to explain; the panel never shows the bare reason code', async () => {
    panel({ kind: 'chain-payments', sessionId: 'cs_1', baseUrl: 'https://pay.example.org' })
    await settle()
    await button(w!, 'Kit rejected').trigger('click')
    await settle()
    expect(w!.find('.checkout > .mw-notice, .checkout > [role="alert"]').exists()).toBe(false)
    expect(w!.text().replace(/Kit rejected/g, '')).not.toMatch(/\brejected\b/)
    await button(w!, 'Kit fails oddly').trigger('click')
    await settle()
    expect(w!.text()).toContain('The payment did not complete. Check your wallet’s history before you try again.')
    expect(w!.text()).not.toContain('something-new')
  })

  // Open Payments: a wallet that answers with a non-https approval address is not followed, and says why.
  it('Open Payments: a wallet that answers with a non-https approval address is not followed, and says why', async () => {
    const s = new FakeService()
    s.openPaymentsRedirect = 'http://localhost:9/approve'
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    try {
      panel({ kind: 'open-payments', payee: 'https://wallet.example/shop', amount: '6.00', assetCode: 'GBP' }, s)
      await settle()
      await w!.find('#op-wallet').setValue('$wallet.example/alice')
      await w!.find('form.wallet').trigger('submit')
      await settle()
      expect(assign).not.toHaveBeenCalled()
      expect(w!.text()).toContain('Your wallet did not give an https address to approve the payment at')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // A provider’s page: plain words and a plain link there (no new window).
  it('a provider’s page: plain words and a plain link there (no new window)', async () => {
    panel({ kind: 'redirect', url: 'https://pay.example.org/c/1', provider: 'square' })
    await settle()
    expect(w!.text()).toContain('You pay on Square’s own page. When you have paid, it sends you back here')
    const a = w!.find('a.mw-btn')
    expect(a.attributes('href')).toBe('https://pay.example.org/c/1')
    expect(a.attributes('target')).toBeUndefined()
    expect(a.text()).toBe('Continue to Square')
  })

  // A bank transfer: every detail with a copy button, the reference first and foremost, the QR payload as text.
  it('a bank transfer: every detail with a copy button, the reference first and foremost, the QR payload as text', async () => {
    panel({ kind: 'bank-transfer', scheme: 'sepa', payee: 'Example Ltd', iban: 'DE00 1234 5678', bic: 'EXAMPLEX', sortCode: null, accountNumber: null, amount: '12.00', currency: 'EUR', reference: 'RF18 5390 0754 7034', qr: 'BCD\n002\n1\nSCT\nEXAMPLEX' })
    await settle()
    const text = w!.text()
    for (const s of ['Pay to', 'Example Ltd', 'IBAN', 'DE00 1234 5678', 'BIC', '12.00 EUR', 'Use exactly this reference', 'RF18 5390 0754 7034', 'up to a working day']) expect(text).toContain(s)
    expect(text).not.toContain('Sort code')
    const copies = w!.findAll('button').map((b) => b.attributes('aria-label') ?? '').filter((l) => l.startsWith('Copy'))
    expect(copies).toEqual(['Copy the Pay to', 'Copy the IBAN', 'Copy the BIC', 'Copy the amount', 'Copy the reference'])
    expect(w!.find('pre').text()).toContain('BCD')
  })

  // A bank transfer is checked once on request, not polled.
  it('a bank transfer is checked once on request, not polled', async () => {
    const s = new FakeService()
    s.checkoutOpenReads = 5
    panel({ kind: 'bank-transfer', scheme: 'faster-payments', payee: 'Example Ltd', sortCode: '00-00-00', accountNumber: '12345678', amount: '9.00', currency: 'GBP', reference: 'LIB-7', qr: null }, s)
    await settle()
    expect(s.checkoutReads).toBe(0)
    await button(w!, 'Check whether it has arrived').trigger('click')
    await settle()
    expect(s.checkoutReads).toBe(1)
    expect(w!.text()).toContain('Not arrived yet.')
  })

  // Anything else: says the method is not available here.
  it('anything else: says the method is not available here', async () => {
    panel({ kind: 'something-new' })
    await settle()
    expect(w!.text()).toContain('This payment method is not available in this app yet.')
  })

  // Returning from a provider’s page (/billing?checkout=<id>): billing opens and follows that checkout.
  it('returning from a provider’s page (/billing?checkout=<id>): billing opens and follows that checkout', async () => {
    const s = new FakeService()
    s.handle = 'ada'
    open('/billing?checkout=c0000001-0000-4000-8000-000000000009', s)
    await settle(14)
    expect(w!.find('[role="tab"][aria-selected="true"]').text()).toBe('Billing')
    expect(s.calls.some((c) => c.path === '/api/v1/billing/checkouts/c0000001-0000-4000-8000-000000000009')).toBe(true)
  })
})

// The report form, which needs no account.
describe('the report form', () => {
  // Needs no account, is prefilled from ?page=, sends the report and confirms it.
  it('needs no account, is prefilled from ?page=, sends the report and confirms it', async () => {
    const s = open('/report?page=Spammy')
    await settle()
    expect((w!.find('#report-page').element as HTMLInputElement).value).toBe('spammy')
    const reasons = w!.findAll('#report-reason option').map((o) => o.attributes('value'))
    expect(reasons).toEqual(['', 'illegal', 'csam', 'terrorism', 'fraud', 'malware', 'harassment', 'impersonation', 'intellectual-property', 'adult', 'spam', 'other'])
    await w!.find('#report-reason').setValue('fraud')
    await w!.find('#report-url').setValue('https://bad.example.org/win')
    await w!.find('#report-details').setValue('Asks for card numbers.')
    await w!.find('form').trigger('submit')
    await settle()
    expect(s.callsTo('POST', '/api/v1/reports')[0]!.body).toEqual({ page: 'spammy', url: 'https://bad.example.org/win', reason: 'fraud', details: 'Asks for card numbers.' })
    expect(w!.text()).toContain('Thank you: your report was sent')
    writesCarryTheHeader(s)
  })
})

// The operator console's gate and its reports queue.
describe('the console', () => {
  it.each([
    [401, 'Sign in through your access gate'],
    [403, 'Sign in through your access gate'],
    [503, 'The console is not available'],
  ] as const)('a %s from the admin API says “%s”', async (status, words) => {
    const s = new FakeService()
    s.gate = status
    open('/admin/', s)
    await settle()
    expect(w!.find('h2').text()).toBe(words)
  })

  // A service that signs operators in itself names where a sign-in starts; the console then offers that as a link, and only a same-site /auth/ path is believed.
  it('offers the sign-in the service names, as a link, and ignores a hint that is not a same-site /auth/ path', async () => {
    const s = new FakeService()
    s.gate = 401
    s.signInHint = '/auth/login'
    open('/admin/', s)
    await settle()
    expect(w!.find('h2').text()).toBe('Sign in')
    expect(w!.find('a.sign-in').attributes('href')).toBe('/auth/login')
    w!.unmount()
    for (const bad of ['https://evil.example/auth/login', '//evil.example/auth/login', '/other']) {
      const t = new FakeService()
      t.gate = 401
      t.signInHint = bad
      open('/admin/', t)
      await settle()
      expect(w!.find('h2').text(), bad).toBe('Sign in through your access gate')
      expect(w!.find('a.sign-in').exists(), bad).toBe(false)
      w!.unmount()
    }
  })

  // Signed in through the provider, the operator signs out through the console and the browser follows the provider's logout address; a refusal says so.
  it('signs out through the console and follows the provider’s logout address, and says so when that fails', async () => {
    const s = new FakeService()
    s.via = 'oidc'
    open('/admin/', s)
    await settle()
    await button(w!, 'Sign out').trigger('click')
    await settle()
    expect(s.callsTo('POST', '/auth/logout')).toHaveLength(1)
    expect(s.callsTo('POST', '/auth/logout')[0]!.headers['x-link-in-bio-request']).toBe('1')
    expect(goTo).toHaveBeenCalledWith('https://accounts.example.org/logout?id_token_hint=x')
    vi.mocked(goTo).mockClear()
    // An address that is not https or same-site is never followed.
    s.logoutRedirect = 'javascript:alert(1)'
    await button(w!, 'Sign out').trigger('click')
    await settle()
    expect(goTo).not.toHaveBeenCalled()
    expect(w!.text()).toContain('Could not sign out')
    s.logoutRefused = true
    await button(w!, 'Sign out').trigger('click')
    await settle()
    expect(goTo).not.toHaveBeenCalled()
  })

  // Behind the access gate (or an older service) there is no sign-out button: the gate signs out by itself.
  it('shows no sign-out button behind the access gate', async () => {
    for (const via of ['access', null] as const) {
      const s = new FakeService()
      s.via = via
      open('/admin/', s)
      await settle()
      expect(w!.text()).toContain('Signed in as')
      expect(w!.findAll('button').some((b) => b.text() === 'Sign out')).toBe(false)
      w!.unmount()
    }
  })

  // A 503 passes on the service’s words and offers a reload; an HTML error page from the edge is an error, not a sign-in.
  it('a 503 passes on the service’s words and offers a reload; an HTML error page from the edge is an error, not a sign-in', async () => {
    const s = new FakeService()
    s.gate = 503
    open('/admin/', s)
    await settle()
    expect(w!.text()).toContain('The service says: the console is not configured.')
    expect(button(w!, 'Reload').exists()).toBe(true)
    w!.unmount()
    const edge = new FakeService()
    edge.gate = 502
    open('/admin/', edge)
    await settle()
    expect(w!.find('h2').exists()).toBe(false)
    expect(w!.text()).not.toContain('Sign in through your access gate')
    expect(w!.text()).toContain('The server had a problem.')
  })

  // Decides a report: actioned, with a decision and a statement, hiding its link.
  it('decides a report: actioned, with a decision and a statement, hiding its link', async () => {
    const s = open('/admin/')
    await settle()
    await w!.findAll('[role="tab"]').find((t) => t.text() === 'Reports')!.trigger('click')
    await settle()
    const id = 'r0000001-0000-4000-8000-000000000001'
    await w!.find(`#rep-dec-${id}`).setValue('link hidden')
    await w!.find(`#rep-st-${id}`).setValue('The link asked for card numbers.')
    const report = w!.findAll('article.report').find((a) => a.text().includes('spammy'))!
    await report.find('input[type="checkbox"]').setValue(true)
    await report.find('form').trigger('submit')
    await settle()
    expect(s.callsTo('POST', `/api/v1/admin/reports/${id}/decide`)[0]!.body).toEqual({ status: 'actioned', decision: 'link hidden', statement: 'The link asked for card numbers.', hideLink: true })
    expect(s.reports.find((r) => r.id === id)!.status).toBe('actioned')
    writesCarryTheHeader(s)
  })
})

// The one-time recovery codes.
describe('recovery codes', () => {
  // Shows the ten codes once, with a copy of all of them, and goes on only after “I saved these codes”.
  it('shows the ten codes once, with a copy of all of them, and goes on only after “I saved these codes”', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `CODE-${i}AAA-BBBB`)
    w = mount(RecoveryCodes, { props: { codes }, attachTo: document.body })
    expect(w.findAll('ol li').map((l) => l.text())).toEqual(codes)
    expect(w.find('button[aria-label="Copy all recovery codes"]').exists()).toBe(true)
    const go = button(w, 'Continue')
    expect(go.attributes('disabled')).toBeDefined()
    await w.find('input[type="checkbox"]').setValue(true)
    expect(go.attributes('disabled')).toBeUndefined()
    await go.trigger('click')
    expect(w.emitted('done')).toHaveLength(1)
  })
})

// The sign-up form.
describe('sign-up', () => {
  // Asks for the handle, the age and the current terms, and an invite code when sign-up is by invitation.
  it('asks for the handle, the age and the current terms, and an invite code when sign-up is by invitation', async () => {
    const s = new FakeService()
    open('/', s)
    await settle()
    await w!.findAll('[role="tab"]').find((t) => t.text() === 'Create an account')!.trigger('click')
    await settle()
    expect(w!.find('#signup-invite').exists()).toBe(true)
    expect(w!.text()).toContain('I am 18 or over')
    expect(w!.text()).toContain('I accept the terms (version 2026-11)')
    expect(w!.text()).toContain('your page will be at handle.example.link')
    expect(w!.find('#signup-country option[value="GB"]').text()).toBe('United Kingdom')
  })
})
