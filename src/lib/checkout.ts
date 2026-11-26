// Following a checkout to its end. The provider's own widget confirms the payment on its side; the account's paid period changes only
// when the service has applied the provider's notification, so the app asks the service until the checkout is no longer open.

// Accepts only addresses that are safe to link.
import { safeHref } from '@meddleware/web-utils'
// The provider's `client` object and a checkout's status.
import type { CheckoutClient, CheckoutStatus } from '../api/types.js'

/** How to poll: the interval, the timeout, a way to stop, and test hooks. */
export interface PollOptions {
  /** Between two questions (default 3 s). */
  intervalMs?: number
  /** Give up after this long (default 10 minutes); the checkout is then reported as it last stood. */
  timeoutMs?: number
  /** Stop early (the view went away). */
  signal?: AbortSignal
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** Each answer, as it arrives. */
  onStatus?: (s: CheckoutStatus) => void
}

/** Wait for `ms` milliseconds. */
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Ask until the checkout is paid, expired or cancelled, the time runs out, or `signal` aborts. A failed question (the network, a 503) is
 * asked again at the next interval; only a 404 (not this account's checkout) ends it. Resolves with the last status seen.
 */
export async function pollCheckout(get: () => Promise<CheckoutStatus>, opts: PollOptions = {}): Promise<CheckoutStatus | null> {
  // Between two questions.
  const interval = opts.intervalMs ?? 3000
  // The longest the app keeps asking.
  const timeout = opts.timeoutMs ?? 10 * 60 * 1000
  // The wait between questions (replaceable in tests).
  const sleep = opts.sleep ?? wait
  // The clock (replaceable in tests).
  const now = opts.now ?? Date.now
  // When to give up.
  const end = now() + timeout
  // The last status seen, which is what a timeout reports.
  let last: CheckoutStatus | null = null
  // Ask, check, wait: until the checkout is no longer open, the time runs out or the caller aborts.
  for (;;) {
    // The view went away.
    if (opts.signal?.aborted) return last
    try {
      // One question.
      last = await get()
      // Tell the caller each answer as it arrives.
      opts.onStatus?.(last)
      // Paid, expired or cancelled: the answer is final.
      if (last.status !== 'open') return last
    } catch (e) {
      // Not this account's checkout: asking again cannot help.
      if ((e as { status?: number }).status === 404) throw e
    }
    // Out of time (or aborted while waiting): report what was last seen.
    if (now() >= end || opts.signal?.aborted) return last
    // Wait for the next question.
    await sleep(interval)
  }
}

// ── what a started checkout asks the browser to do ─────────────────────────────────────────────────────────────────────


/** One line of bank details: a label and its value. */
export interface BankDetail {
  label: string
  value: string
}

/** What a started checkout asks the browser to do, by kind. */
export type CheckoutPlan =
  /** Chain Payments: its checkout widget, paid from the connected wallet. */
  | { kind: 'chain-payments'; sessionId: string; baseUrl: string }
  /** A payment provider's own page: the person pays there and is sent back to `/billing?checkout=<id>`. */
  | { kind: 'redirect'; url: string; provider: string }
  /** A bank transfer the person makes from their own bank, matched by its reference. */
  | {
      kind: 'bank-transfer'
      scheme: string
      details: BankDetail[]
      amount: string
      currency: string
      reference: string
      qr: string | null
    }
  /** Open Payments (Interledger): the person names their wallet, approves the payment there and comes back here. */
  | { kind: 'open-payments'; payee: string; amount: string; assetCode: string }
  /** A kind this app cannot handle yet. */
  | { kind: 'unsupported' }

// Provider ids and the names people know them by.
const PROVIDERS: Record<string, string> = { square: 'Square', gocardless: 'GoCardless', paddle: 'Paddle' }
// Bank transfer schemes in words.
const SCHEMES: Record<string, string> = { sepa: 'a SEPA transfer', 'faster-payments': 'a Faster Payments transfer' }

// A non-empty string, trimmed, or null: the provider's answer is untrusted.
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * A URL the browser is sent away to (a provider's payment page, an Open Payments wallet's approval page): `safeHref`, and https only.
 * `safeHref` also lets `http://localhost` through for development links; a payment page never is one.
 */
export function httpsHref(v: string | null | undefined): string | null {
  // A safe address, if it is one.
  const u = safeHref(v)
  return u?.startsWith('https://') ? u : null
}

/** Read the provider's `client` object into what the billing view shows. Anything malformed is `unsupported`, never guessed at. */
export function planCheckout(client: CheckoutClient | null | undefined): CheckoutPlan {
  // The `client` object, or an empty one.
  const c = (client ?? {}) as Record<string, unknown>
  // Each kind is read field by field; anything missing or malformed makes the whole plan `unsupported`.
  switch (c.kind) {
    // Chain Payments: a session id and its public address.
    case 'chain-payments': {
      const sessionId = text(c.sessionId)
      const baseUrl = safeHref(text(c.baseUrl))
      return sessionId && baseUrl ? { kind: 'chain-payments', sessionId, baseUrl } : { kind: 'unsupported' }
    }
    // A provider's own payment page, https only.
    case 'redirect': {
      const url = httpsHref(text(c.url))
      const provider = text(c.provider)
      return url ? { kind: 'redirect', url, provider: (provider && PROVIDERS[provider]) ?? provider ?? 'the payment provider' } : { kind: 'unsupported' }
    }
    // A bank transfer: the reference, amount, currency and payee are required.
    case 'bank-transfer': {
      const reference = text(c.reference)
      const amount = text(c.amount)
      const currency = text(c.currency)
      const payee = text(c.payee)
      if (!reference || !amount || !currency || !payee) return { kind: 'unsupported' }
      // The account details to show, starting with who to pay.
      const details: BankDetail[] = [{ label: 'Pay to', value: payee }]
      // Whichever of the account identifiers the provider gave.
      for (const [key, label] of [
        ['iban', 'IBAN'],
        ['bic', 'BIC'],
        ['sortCode', 'Sort code'],
        ['accountNumber', 'Account number'],
      ] as const) {
        const v = text(c[key])
        if (v) details.push({ label, value: v })
      }
      // A transfer with no account to send it to is unusable.
      if (details.length === 1) return { kind: 'unsupported' }
      // The transfer scheme, in words.
      const scheme = text(c.scheme) ?? ''
      return { kind: 'bank-transfer', scheme: SCHEMES[scheme] ?? 'a bank transfer', details, amount, currency, reference, qr: text(c.qr) }
    }
    // Open Payments: the payee's address, the amount and its asset.
    case 'open-payments': {
      const payee = safeHref(text(c.payee))
      const amount = text(c.amount)
      const assetCode = text(c.assetCode)
      return payee && amount && assetCode ? { kind: 'open-payments', payee, amount, assetCode } : { kind: 'unsupported' }
    }
    // A kind this build does not know.
    default:
      return { kind: 'unsupported' }
  }
}

/** A wallet address as the person may type it: an https URL, or a `$` payment pointer (which means https). */
export function walletAddressValid(v: string): boolean {
  // The address without stray spaces.
  const t = v.trim()
  // A `$` payment pointer means https.
  const url = t.startsWith('$') ? `https://${t.slice(1)}` : t
  try {
    // Parse it; a malformed address throws and is invalid.
    const u = new URL(url)
    // https only, with a host and no credentials in the address.
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password
  } catch {
    return false
  }
}
