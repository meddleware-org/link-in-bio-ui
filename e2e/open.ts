// Opens the built app (the e2e build: a mock wallet and a stub chain) wired to the in-memory FakeService through page.route, so a run
// needs no network: every request that leaves localhost is refused, except the example Chain Payments origin, which is answered here.
// Returns the fake and what the page reported (uncaught errors, CSP violations).
import { expect, type Page } from '@playwright/test'
import { FakeService } from '../tests/support/fake-service.js'

export const PAY_ORIGIN = 'https://pay.example.org'

const SESSION = {
  id: '0123456789abcdef0123456789abcdef', status: 'open', amountPence: 300, amountText: '£3.00', description: 'Example Links, 1 month', units: 1,
  expiresAt: '2026-11-16T13:00:00Z',
  methods: [{ id: 'sui-testnet:SUI', chain: 'sui', network: 'testnet', symbol: 'SUI', decimals: 9, coinType: '0x2::sui::SUI', packageId: `0x${'1'.repeat(64)}`, merchantObject: `0x${'2'.repeat(64)}` }],
}

export async function wire(page: Page, service = new FakeService()) {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`error: ${e.message}`))
  page.on('console', (m) => {
    if (/content security policy|refused to/i.test(m.text())) problems.push(`csp: ${m.text()}`)
  })
  await page.route(/^https?:\/\/(?!(localhost|127\.0\.0\.1)[:/])/, (route) => route.abort())
  await page.route(`${PAY_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(SESSION) }),
  )
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const r = service.respond(req.method(), u.pathname + u.search, await req.allHeaders(), req.postData() ?? undefined)
    if (r.status === 204) return route.fulfill({ status: 204, body: '' })
    if (r.text !== undefined) return route.fulfill({ status: r.status, contentType: r.contentType ?? 'text/html', body: r.text })
    return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.json ?? null) })
  })
  return { service, problems }
}

/** The app at `path` with the service as given (signed out unless `service.handle` is set). */
export async function open(page: Page, path = '/', service = new FakeService()) {
  const wired = await wire(page, service)
  await page.goto(path)
  return wired
}

/** Signed in as ada, on the page editor. */
export async function signedIn(page: Page, service = new FakeService()) {
  service.handle = 'ada'
  const wired = await open(page, '/', service)
  await expect(page.getByRole('heading', { level: 2, name: 'Your page' })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada Example')
  return wired
}

export const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })

/** The console, on one of its sections. */
export async function consoleAt(page: Page, section = 'Overview', service = new FakeService()) {
  const wired = await open(page, '/admin/', service)
  await expect(page.getByText('Signed in as op@example.org')).toBeVisible()
  if (section !== 'Overview') await tab(page, section).click()
  await expect(page.getByRole('heading', { level: 2, name: section === 'Audit log' ? 'Audit log' : section })).toBeVisible()
  return wired
}
