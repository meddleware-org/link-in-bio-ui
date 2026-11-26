// The shared accessibility sweep (WCAG 2.2 AA and AAA in every colour mode × season, reflow, text size, forced colours, reduced motion,
// keyboard) over every state a person can reach: each area, each console section, each kind of checkout, the one-time recovery codes,
// the console's gate answers and the app when the service is down, each with its busiest content showing.
import { expect, type Page } from '@playwright/test'
import { defineA11ySuite } from '@meddleware/frontend-config/a11y'
import { connectMockWallet } from '@meddleware/frontend-config/wallet'
import { FakeService } from '../tests/support/fake-service.js'
import { consoleAt, open, signedIn, tab, wire } from './open.js'

/** Billing with a checkout of this kind started (the fake service answers every checkout with `client`). */
async function checkout(page: Page, client?: Record<string, unknown>) {
  const service = new FakeService()
  if (client) service.checkoutClient = client
  await signedIn(page, service)
  await tab(page, 'Billing').click()
  await page.getByRole('radio', { name: /^SUI/ }).check()
  await page.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(page.getByRole('heading', { level: 3, name: 'Paying' })).toBeVisible()
}

/** A console section by its tab, with the heading it opens on. */
async function section(page: Page, name: string, heading = name) {
  await consoleAt(page, 'Overview')
  await tab(page, name).click()
  await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
}

/** The console with the admin API answering `gate`. */
async function gate(page: Page, status: 403 | 503) {
  const service = new FakeService()
  service.gate = status
  await open(page, '/admin/', service)
}

// One entry per state a person can reach; each opens the app and waits for the state's heading.
defineA11ySuite(
  {
    // Sign in.
    'sign-in': async (page) => {
      await open(page)
      await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
    },
    // Create an account.
    'sign-up': async (page) => {
      await open(page)
      await tab(page, 'Create an account').click()
      await expect(page.getByRole('heading', { level: 2, name: 'Create an account' })).toBeVisible()
    },
    // axe injects a script into every frame, and the preview frame allows none (sandbox=""), so a run over it never finishes. The
    // shared sweep has no per-state exclude, so this state takes the frame out after checking it; app.spec.ts runs axe (frame
    // excluded) and the keyboard pass over the editor WITH its frame, and the frame's content is the service's page renderer, which
    // the service's own sweep covers.
    editor: async (page) => {
      await signedIn(page)
      await page.getByLabel('Name', { exact: true }).fill('')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('region', { name: 'The page was not saved' })).toBeVisible()
      await expect(page.locator('iframe.preview-frame')).toHaveAttribute('sandbox', '')
      await page.locator('iframe.preview-frame').evaluate((f) => f.remove())
    },
    // Billing, with the paid period and past payments.
    billing: async (page) => {
      await signedIn(page)
      await tab(page, 'Billing').click()
      await expect(page.getByRole('heading', { name: 'Past payments' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Cancel a payment' })).toBeVisible()
    },
    'billing: refund requested': async (page) => {
      await signedIn(page)
      await tab(page, 'Billing').click()
      await page.getByRole('button', { name: 'Ask for this payment back' }).click()
      await expect(page.getByRole('heading', { name: 'Your refund request' })).toBeVisible()
    },
    // The account with its ways to sign in, decisions and domains.
    account: async (page) => {
      await signedIn(page)
      await tab(page, 'Account').click()
      await expect(page.getByRole('heading', { name: 'Your own domain' })).toBeVisible()
    },
    // The report form.
    report: async (page) => {
      await open(page, '/report?page=spammy')
      await expect(page.getByRole('heading', { level: 2, name: 'Report a page' })).toBeVisible()
    },
    // The console's overview.
    'console overview': async (page) => {
      await consoleAt(page, 'Overview')
      await expect(page.getByRole('heading', { name: 'Switches' })).toBeVisible()
      await expect(page.getByRole('heading', { name: /^Web Risk this month/ })).toBeVisible()
    },
    'console refunds': async (page) => {
      await consoleAt(page, 'Refunds')
      await expect(page.getByRole('heading', { name: /^spammy: cancellation/ })).toBeVisible()
    },
    'console reports': async (page) => {
      await consoleAt(page, 'Reports')
      await expect(page.getByRole('article', { name: 'A scam or fraud: spammy' })).toBeVisible()
    },
    // The local editor (the loopback backend): its preview is a srcdoc frame with sandbox="", taken out as in the editor state.
    'local editor': async (page) => {
      const service = new FakeService()
      service.hosted = false
      await open(page, '/edit', service)
      await expect(page.getByRole('heading', { level: 2, name: 'Edit your page' })).toBeVisible()
      await expect(page.locator('iframe.preview-frame')).toHaveAttribute('sandbox', '')
      await page.locator('iframe.preview-frame').evaluate((f) => f.remove())
    },
    // The recovery codes shown once.
    'recovery codes': async (page) => {
      await open(page)
      await tab(page, 'Create an account').click()
      await page.getByLabel('Handle', { exact: true }).fill('newbie')
      await page.getByLabel('Invite code').fill('INVITE-0001')
      await page.getByLabel('I am 18 or over').check()
      await page.getByLabel(/I accept the terms/).check()
      // The label, not its visually hidden radio. Its text is "✓ Sui wallet" when already chosen (WebKit has no passkeys).
      await page.locator('label', { has: page.getByRole('radio', { name: 'Sui wallet' }) }).click()
      await connectMockWallet(page)
      await page.getByRole('button', { name: 'Create the account' }).click()
      await expect(page.getByRole('heading', { name: 'Your recovery codes' })).toBeVisible()
    },
    // The app when the service is down.
    'service unavailable': async (page) => {
      await wire(page)
      await page.route('**/api/v1/instance', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"the database is unavailable; try again shortly","code":"unavailable"}' }))
      await page.goto('/')
      await expect(page.getByText('The service is temporarily unavailable.')).toBeVisible()
    },
    'checkout: crypto price and fee': async (page) => {
      await checkout(page)
      await page.getByRole('button', { name: 'Get the exact price' }).click()
      await expect(page.getByText('Platform fee (included)')).toBeVisible()
    },
    'checkout: provider page': async (page) => {
      await checkout(page, { kind: 'redirect', url: 'https://pay.example.org/c/1', provider: 'square' })
      await expect(page.getByRole('link', { name: 'Continue to Square' })).toBeVisible()
    },
    'checkout: bank transfer': async (page) => {
      await checkout(page, { kind: 'bank-transfer', scheme: 'sepa', payee: 'Example Ltd', iban: 'DE00 1234 5678 9012 3456 78', bic: 'EXAMPLEXXXX', sortCode: null, accountNumber: null, amount: '12.00', currency: 'EUR', reference: 'RF18 5390 0754 7034', qr: 'BCD\n002\n1\nSCT\nEXAMPLEXXXX\nExample Ltd\nDE00123456789012345678\nEUR12.00\n\nRF18539007547034' })
      await expect(page.getByText('Use exactly this reference')).toBeVisible()
    },
    'checkout: Open Payments, address refused': async (page) => {
      await checkout(page, { kind: 'open-payments', step: 'wallet-address', payee: 'https://wallet.example/shop', amount: '6.00', assetCode: 'GBP' })
      await page.getByLabel('Your wallet address').fill('notawallet')
      await page.getByRole('button', { name: 'Continue to your wallet' }).click()
      await expect(page.getByText('Enter your wallet address')).toBeVisible()
    },
    'report sent': async (page) => {
      await open(page, '/report?page=spammy')
      await page.getByLabel('What is wrong').selectOption({ label: 'A scam or fraud' })
      await page.getByRole('button', { name: 'Send the report' }).click()
      await expect(page.getByRole('heading', { name: 'Thank you: your report was sent' })).toBeVisible()
    },
    'console sign-in': async (page) => {
      await gate(page, 403)
      await expect(page.getByRole('heading', { level: 2, name: 'Sign in through your access gate' })).toBeVisible()
    },
    'console unavailable': async (page) => {
      await gate(page, 503)
      await expect(page.getByRole('heading', { level: 2, name: 'The console is not available' })).toBeVisible()
    },
    'console account': async (page) => {
      await section(page, 'Accounts')
      await page.getByRole('button', { name: 'Open (ada)' }).click()
      await expect(page.getByRole('heading', { level: 3, name: 'ada' })).toBeVisible()
    },
    'console invites': async (page) => {
      await section(page, 'Invites')
    },
    'console selections': async (page) => {
      await section(page, 'Selections')
    },
    'console appeals': async (page) => {
      await section(page, 'Appeals')
    },
    'console blocklist': async (page) => {
      await section(page, 'Blocklist')
    },
    'console links': async (page) => {
      await section(page, 'Links', 'Link verdict')
    },
    'console audit log': async (page) => {
      await section(page, 'Audit log')
    },
  },
  { aaa: 'gate' },
)
