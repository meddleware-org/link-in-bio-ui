// Screenshots for LOOKING at the app (see @meddleware/frontend-config/shots). Run: npm run shots. One state per main view, served by the
// in-memory FakeService, so layout, spacing, overflow and wording problems no assertion catches can be seen.
import { expect } from '@playwright/test'
import { defineShots, type State } from '@meddleware/frontend-config/shots'
import { consoleAt, open, signedIn, tab } from './open.js'

const states: Record<string, State> = {
  'sign-in': async (page) => {
    await open(page)
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
  },
  'sign-up': async (page) => {
    await open(page)
    await tab(page, 'Create an account').click()
    await expect(page.getByRole('heading', { level: 2, name: 'Create an account' })).toBeVisible()
  },
  editor: async (page) => {
    await signedIn(page)
    await page.waitForLoadState('networkidle')
  },
  billing: async (page) => {
    await signedIn(page)
    await tab(page, 'Billing').click()
    await expect(page.getByRole('heading', { name: 'Past payments' })).toBeVisible()
  },
  account: async (page) => {
    await signedIn(page)
    await tab(page, 'Account').click()
    await expect(page.getByRole('heading', { name: 'Your own domain' })).toBeVisible()
  },
  report: async (page) => {
    await open(page, '/report?page=spammy')
    await expect(page.getByRole('heading', { level: 2, name: 'Report a page' })).toBeVisible()
  },
  'console-overview': async (page) => {
    await consoleAt(page, 'Overview')
  },
  'console-reports': async (page) => {
    await consoleAt(page, 'Reports')
  },
}

defineShots(states)
