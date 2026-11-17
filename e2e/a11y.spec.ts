// The shared accessibility sweep (WCAG 2.2 AA and AAA in every colour mode × season, reflow, text size, forced colours, reduced motion,
// keyboard) over the main states, each with its busiest content showing.
import { expect } from '@playwright/test'
import { defineA11ySuite } from '@meddleware/frontend-config/a11y'
import { consoleAt, open, signedIn, tab } from './open.js'

defineA11ySuite(
  {
    'sign-in': async (page) => {
      await open(page)
      await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
    },
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
    'console overview': async (page) => {
      await consoleAt(page, 'Overview')
      await expect(page.getByRole('heading', { name: 'Switches' })).toBeVisible()
    },
    'console reports': async (page) => {
      await consoleAt(page, 'Reports')
      await expect(page.getByRole('article', { name: 'A scam or fraud: spammy' })).toBeVisible()
    },
  },
  { aaa: 'gate' },
)
