// Following a checkout to its end. The provider's own widget confirms the payment on its side; the account's paid period changes only
// when the service has applied the provider's notification, so the app asks the service until the checkout is no longer open.

import { safeHref } from '@meddleware/web-utils'
import type { CheckoutClient, CheckoutStatus } from '../api/types.js'

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

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Ask until the checkout is paid, expired or cancelled, the time runs out, or `signal` aborts. A failed question (the network, a 503) is
 * asked again at the next interval; only a 404 (not this account's checkout) ends it. Resolves with the last status seen.
 */
export async function pollCheckout(get: () => Promise<CheckoutStatus>, opts: PollOptions = {}): Promise<CheckoutStatus | null> {
  const interval = opts.intervalMs ?? 3000
  const timeout = opts.timeoutMs ?? 10 * 60 * 1000
  const sleep = opts.sleep ?? wait
  const now = opts.now ?? Date.now
  const end = now() + timeout
  let last: CheckoutStatus | null = null
  for (;;) {
    if (opts.signal?.aborted) return last
    try {
      last = await get()
      opts.onStatus?.(last)
      if (last.status !== 'open') return last
    } catch (e) {
      if ((e as { status?: number }).status === 404) throw e
    }
    if (now() >= end || opts.signal?.aborted) return last
    await sleep(interval)
  }
}

// ── what a started checkout asks the browser to do ─────────────────────────────────────────────────────────────────────


export interface BankDetail {
  label: string
  value: string
}

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
  /** A kind this app cannot handle yet. */
  | { kind: 'unsupported' }

const PROVIDERS: Record<string, string> = { square: 'Square', gocardless: 'GoCardless', paddle: 'Paddle' }
const SCHEMES: Record<string, string> = { sepa: 'a SEPA transfer', 'faster-payments': 'a Faster Payments transfer' }

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Read the provider's `client` object into what the billing view shows. Anything malformed is `unsupported`, never guessed at. */
export function planCheckout(client: CheckoutClient | null | undefined): CheckoutPlan {
  const c = (client ?? {}) as Record<string, unknown>
  switch (c.kind) {
    case 'chain-payments': {
      const sessionId = text(c.sessionId)
      const baseUrl = safeHref(text(c.baseUrl))
      return sessionId && baseUrl ? { kind: 'chain-payments', sessionId, baseUrl } : { kind: 'unsupported' }
    }
    case 'redirect': {
      const url = safeHref(text(c.url))
      const provider = text(c.provider)
      return url ? { kind: 'redirect', url, provider: (provider && PROVIDERS[provider]) ?? provider ?? 'the payment provider' } : { kind: 'unsupported' }
    }
    case 'bank-transfer': {
      const reference = text(c.reference)
      const amount = text(c.amount)
      const currency = text(c.currency)
      const payee = text(c.payee)
      if (!reference || !amount || !currency || !payee) return { kind: 'unsupported' }
      const details: BankDetail[] = [{ label: 'Pay to', value: payee }]
      for (const [key, label] of [
        ['iban', 'IBAN'],
        ['bic', 'BIC'],
        ['sortCode', 'Sort code'],
        ['accountNumber', 'Account number'],
      ] as const) {
        const v = text(c[key])
        if (v) details.push({ label, value: v })
      }
      if (details.length === 1) return { kind: 'unsupported' }
      const scheme = text(c.scheme) ?? ''
      return { kind: 'bank-transfer', scheme: SCHEMES[scheme] ?? 'a bank transfer', details, amount, currency, reference, qr: text(c.qr) }
    }
    default:
      return { kind: 'unsupported' }
  }
}
