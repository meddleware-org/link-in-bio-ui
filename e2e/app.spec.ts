// The built app in a real browser, under the production CSP, against the fake service. What these prove that the component tests
// cannot: a real WebAuthn ceremony (a virtual authenticator), the real sandboxed frame, real focus movement, and the flows end to end.
import { expect, test, type CDPSession } from '@playwright/test'
import { expectKeyboardFocusVisible } from '@meddleware/frontend-config/a11y'
import { expectAccessible } from '@meddleware/frontend-config/axe'
import { connectMockWallet } from '@meddleware/frontend-config/wallet'
import { FakeService } from '../tests/support/fake-service.js'
import { consoleAt, open, signedIn, tab } from './open.js'

test('signing up with a passkey (a virtual authenticator), then the recovery codes once', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The virtual authenticator is a Chromium DevTools Protocol feature (WebAuthn.addVirtualAuthenticator).')
  const cdp: CDPSession = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  const { service, problems } = await open(page)
  await tab(page, 'Create an account').click()
  await page.getByLabel('Handle', { exact: true }).fill('newbie')
  await page.getByLabel('Invite code').fill('INVITE-0001')
  await page.getByLabel('I am 18 or over').check()
  await page.getByLabel(/I accept the terms \(version 2026-11\)/).check()
  await page.getByRole('button', { name: 'Create the account' }).click()

  await expect(page.getByRole('heading', { name: 'Your recovery codes' })).toBeVisible()
  await expect(page.locator('.recovery-codes li')).toHaveCount(10)
  const go = page.getByRole('button', { name: 'Continue' })
  await expect(go).toBeDisabled()
  await page.getByLabel('I saved these codes').check()
  await go.click()
  await expect(page.getByRole('heading', { level: 2, name: 'Your page' })).toBeVisible()
  await expect(page.getByText('Your recovery codes')).toHaveCount(0)

  const finish = service.callsTo('POST', '/api/v1/signup/finish')[0]!.body as { credential: { id: string; rawId: string; response: Record<string, string> } }
  expect(finish.credential.response.attestationObject).toMatch(/^[A-Za-z0-9_-]+$/)
  expect(finish.credential.response.clientDataJSON).toMatch(/^[A-Za-z0-9_-]+$/)
  const start = service.callsTo('POST', '/api/v1/signup/start')[0]!.body
  expect(start).toEqual({ handle: 'newbie', ageConfirmed: true, termsAccepted: true, termsVersion: '2026-11', invite: 'INVITE-0001', method: 'passkey' })
  expect(problems).toEqual([])
})

test('signing in with a Sui wallet: the wallet signs the service’s message', async ({ page }) => {
  const { service, problems } = await open(page)
  await connectMockWallet(page)
  await page.getByRole('button', { name: 'Sign in with this wallet' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Your page' })).toBeVisible()
  expect(service.callsTo('POST', '/api/v1/login/wallet/start')[0]!.body).toEqual({ address: `0x${'a'.repeat(64)}` })
  expect((service.callsTo('POST', '/api/v1/login/wallet/finish')[0]!.body as { signature: string }).signature).toBeTruthy()
  expect(problems).toEqual([])
})

test('the editor round trip: change, save, and the sandboxed preview shows the saved draft', async ({ page }) => {
  const { service, problems } = await signedIn(page)
  const frame = page.locator('iframe.preview-frame')
  await expect(frame).toHaveAttribute('sandbox', '')
  expect(await frame.getAttribute('src')).toMatch(/^\/api\/v1\/page\/preview\?v=0$/)
  await expect(page.frameLocator('iframe.preview-frame').getByRole('heading', { name: 'Ada Example' })).toBeVisible()

  await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace-Example')
  await page.getByRole('button', { name: 'Add a link', exact: true }).click()
  await expect(page.locator('#f-item-link-1-title')).toBeFocused()
  await page.locator('#f-item-link-1-title').fill('Talks')
  await page.locator('#f-item-link-1-url').fill('https://talks.example.org/')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeAttached()
  await expect(frame).toHaveAttribute('src', '/api/v1/page/preview?v=1')
  await expect(page.frameLocator('iframe.preview-frame').getByRole('heading', { name: 'Ada Lovelace-Example' })).toBeVisible()
  expect(service.draft.identity.displayName).toBe('Ada Lovelace-Example')
  expect(service.draft.items.at(-1)).toEqual({ kind: 'link', id: 'link-1', title: 'Talks', url: 'https://talks.example.org/' })
  expect(problems).toEqual([])
})

test('the frame has no permissions: scripts and the app’s origin are out of its reach', async ({ page }) => {
  const { problems } = await signedIn(page)
  const sandbox = await page.locator('iframe.preview-frame').evaluate((f: HTMLIFrameElement) => ({ value: f.getAttribute('sandbox'), tokens: [...f.sandbox] }))
  expect(sandbox).toEqual({ value: '', tokens: [] })
  expect(problems).toEqual([])
})

test('the editor with its preview frame: WCAG 2.2 AA and AAA (the script-less frame excluded from axe), and the keyboard', async ({ page }) => {
  test.setTimeout(120_000)
  const { problems } = await signedIn(page)
  await expectAccessible(page, { exclude: ['iframe.preview-frame'], aaa: 'gate' })
  await expectKeyboardFocusVisible(page)
  expect(problems).toEqual([])
})

test('validation: the service’s messages sit next to their fields and in a summary that links to them', async ({ page }) => {
  const { problems } = await signedIn(page)
  await page.getByLabel('Name', { exact: true }).fill('')
  await page.locator('#f-item-code-url').fill('http://code.example.org/ada')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const summary = page.getByRole('region', { name: 'The page was not saved' })
  await expect(summary).toBeFocused()
  await expect(summary.getByRole('link', { name: 'A link must start with https:// or mailto:.' })).toBeVisible()
  await expect(page.locator('#f-item-code-url')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#f-item-code-url-err')).toHaveText(/A link must start with https:\/\/ or mailto:/)
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await summary.getByRole('link', { name: 'A link must start with https:// or mailto:.' }).click()
  await expect(page).toHaveURL(/#f-item-code-url$/)
  expect(problems).toEqual([])
})

test('reordering by keyboard: the moved link keeps focus, and where it went is announced', async ({ page }) => {
  const { service, problems } = await signedIn(page)
  const down = page.getByRole('button', { name: 'Move down (My website)' })
  await down.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Moved “My website” down: now 2 of 3.')).toBeAttached()
  await expect(down).toBeFocused()
  await page.keyboard.press('Enter')
  // Now last in its list: "down" is disabled, so focus moves to its "up".
  await expect(page.getByRole('button', { name: 'Move down (My website)' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Move up (My website)' })).toBeFocused()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeAttached()
  expect(service.draft.items.map((i: { id: string }) => i.id)).toEqual(['code', 'writing', 'website'])
  expect(problems).toEqual([])
})

test('the report form: no account, prefilled, sent, confirmed', async ({ page }) => {
  const { service, problems } = await open(page, '/report?page=spammy')
  await expect(page.getByRole('heading', { level: 2, name: 'Report a page' })).toBeVisible()
  await expect(page.getByLabel('The page’s handle')).toHaveValue('spammy')
  await page.getByLabel('What is wrong').selectOption({ label: 'A scam or fraud' })
  await page.getByLabel('Details (optional)').fill('Asks for card numbers.')
  await page.getByRole('button', { name: 'Send the report' }).click()
  await expect(page.getByRole('heading', { name: 'Thank you: your report was sent' })).toBeVisible()
  expect(service.callsTo('POST', '/api/v1/reports')[0]!.body).toEqual({ page: 'spammy', reason: 'fraud', details: 'Asks for card numbers.' })
  expect(problems).toEqual([])
})

test('billing: paying for months with Chain Payments opens its checkout', async ({ page }) => {
  const { service, problems } = await signedIn(page)
  await tab(page, 'Billing').click()
  await expect(page.getByRole('heading', { name: 'Your paid period' })).toBeVisible()
  await page.getByRole('radio', { name: /^SUI/ }).check()
  await page.getByLabel('Months', { exact: true }).selectOption('3')
  await expect(page.getByText('Total: £9.00')).toBeVisible()
  await page.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(page.getByRole('heading', { name: 'Pay with crypto' })).toBeVisible()
  await expect(page.getByText('Example Links, 1 month')).toBeVisible()
  await page.getByRole('button', { name: 'Get the exact price' }).click()
  await expect(page.getByText('Pay exactly 5.542213191 SUI', { exact: true })).toBeVisible()
  // The platform fee is read from the chain (the stub's PlatformConfig, 0.2 %) and shown before the wallet opens.
  await expect(page.getByText('Platform fee (included)')).toBeVisible()
  await expect(page.getByText(/^0\.011084426 SUI to the platform/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay with your wallet' })).toBeVisible()
  expect(service.callsTo('POST', '/api/v1/billing/checkouts')[0]!.body).toEqual({ method: 'chain-payments:sui-testnet:SUI', months: 3 })
  expect(problems).toEqual([])
})

test('the console: deciding a report in the queue', async ({ page }) => {
  const { service, problems } = await consoleAt(page, 'Reports')
  const report = page.getByRole('article', { name: 'A scam or fraud: spammy' })
  await report.getByLabel('Decision (short)').fill('link hidden')
  await report.getByLabel('Statement of reasons (the owner sees this)').fill('The link asked for card numbers.')
  await report.getByLabel('Hide this link on every page').check()
  await report.getByRole('button', { name: 'Record the decision' }).click()
  await expect(page.getByText('The report about spammy is actioned.')).toBeAttached()
  await expect(page.getByRole('article', { name: 'A scam or fraud: spammy' })).toHaveCount(0)
  expect(service.reports.find((r) => r.page === 'spammy')).toMatchObject({ status: 'actioned', decision: 'link hidden', hidden: true })
  expect(problems).toEqual([])
})

test('the console says what to do when the gate has not signed the operator in, or the console is not configured', async ({ page }) => {
  const s = new FakeService()
  s.gate = 403
  await open(page, '/admin/', s)
  await expect(page.getByRole('heading', { level: 2, name: 'Sign in through your access gate' })).toBeVisible()
  s.gate = 503
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'The console is not configured' })).toBeVisible()
})

test('every main view fits a phone: no horizontal scroll of the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  const { problems } = await signedIn(page)
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(await overflow(), 'editor').toBeLessThanOrEqual(0)
  for (const name of ['Billing', 'Account']) {
    await tab(page, name).click()
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
    expect(await overflow(), name).toBeLessThanOrEqual(0)
  }
  expect(problems).toEqual([])
})
