// The views against the fake service: the hosted editor (issues next to fields, the sandboxed preview), each kind of checkout, the
// report form, the console's gate and its reports queue, and sign-up's one-time recovery codes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import LinkInBioView from '../src/LinkInBioView.vue'
import CheckoutPanel from '../src/components/CheckoutPanel.vue'
import RecoveryCodes from '../src/components/RecoveryCodes.vue'
import { planCheckout } from '../src/lib/checkout.js'
import { FakeService } from './support/fake-service.js'
import { button, mountWithApp, preload, settle } from './support/mount.js'

// The Chain Payments kit is a sibling package with its own tests; here it is a stand-in that reports its props and can say "paid".
vi.mock('@meddleware/chain-payments-kit', () => ({
  ChainCheckout: defineComponent({
    props: { sessionId: String, baseUrl: String, signAndExecute: Function, level: Number },
    emits: ['paid', 'failed'],
    setup(props, { emit }) {
      return () => h('div', { class: 'kit', 'data-session': props.sessionId, 'data-base': props.baseUrl }, [h('button', { type: 'button', onClick: () => emit('paid', { digest: 'D' }) }, 'Kit pays')])
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

function open(start: string, service = new FakeService()) {
  w = mount(LinkInBioView, { props: { fetch: service.fetch as typeof fetch, start, hostname: 'app.example.link' }, attachTo: document.body })
  return service
}

const writesCarryTheHeader = (s: FakeService) => {
  for (const c of s.calls.filter((x) => x.method !== 'GET')) expect(c.headers['x-link-in-bio-request'], `${c.method} ${c.path}`).toBe('1')
}

describe('the hosted editor', () => {
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

describe('a checkout', () => {
  const panel = (client: Record<string, unknown>, service = new FakeService()) => {
    service.handle = 'ada'
    const m = mountWithApp(CheckoutPanel, { checkoutId: 'c0000001-0000-4000-8000-000000000001', plan: planCheckout(client as never), pollMs: 1 }, service)
    w = m.w
    return m
  }

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

  it('a provider’s page: plain words and a plain link there (no new window)', async () => {
    panel({ kind: 'redirect', url: 'https://pay.example.org/c/1', provider: 'square' })
    await settle()
    expect(w!.text()).toContain('You pay on Square’s own page. When you have paid, it sends you back here')
    const a = w!.find('a.mw-btn')
    expect(a.attributes('href')).toBe('https://pay.example.org/c/1')
    expect(a.attributes('target')).toBeUndefined()
    expect(a.text()).toBe('Continue to Square')
  })

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

  it('anything else: says the method is not available here', async () => {
    panel({ kind: 'something-new' })
    await settle()
    expect(w!.text()).toContain('This payment method is not available in this app yet.')
  })

  it('returning from a provider’s page (/billing?checkout=<id>): billing opens and follows that checkout', async () => {
    const s = new FakeService()
    s.handle = 'ada'
    open('/billing?checkout=c0000001-0000-4000-8000-000000000009', s)
    await settle(14)
    expect(w!.find('[role="tab"][aria-selected="true"]').text()).toBe('Billing')
    expect(s.calls.some((c) => c.path === '/api/v1/billing/checkouts/c0000001-0000-4000-8000-000000000009')).toBe(true)
  })
})

describe('the report form', () => {
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

describe('the console', () => {
  it.each([
    [401, 'Sign in through your access gate'],
    [403, 'Sign in through your access gate'],
    [503, 'The console is not configured'],
  ] as const)('a %s from the admin API says “%s”', async (status, words) => {
    const s = new FakeService()
    s.gate = status
    open('/admin/', s)
    await settle()
    expect(w!.find('h2').text()).toBe(words)
  })

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

describe('recovery codes', () => {
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

describe('sign-up', () => {
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
