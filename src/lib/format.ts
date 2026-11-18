// Dates, money and sizes for people. Times arrive as RFC 3339 strings and are shown in the browser's zone; money arrives in pence.

/** A date and time (`17 Nov 2026, 14:05`), or the fallback when there is none. */
export function when(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return fallback
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/** A date only (`17 Nov 2026`). */
export function day(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return fallback
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d)
}

/** An amount of minor units (pence) in its currency (`£3.00`). Integer arithmetic until the formatter. */
export function money(minor: number, currency = 'GBP'): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`
  }
}

/** The ISO 4217 codes the runtime knows; anything else (a coin such as SUI) is shown with its symbol, not as money. */
const CURRENCIES: ReadonlySet<string> = new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['GBP', 'EUR', 'USD'])

/**
 * An amount in any unit, from its smallest denomination: a currency (an ISO code such as GBP or EUR, with `scale` decimals) as
 * money, anything else (a coin such as SUI or USDC) as its exact decimal and symbol, never rounded.
 */
export function amount(minor: number, unit: string, scale: number | null = 2): string {
  const s = scale ?? 0
  const digits = String(Math.abs(Math.trunc(minor))).padStart(s + 1, '0')
  const exact = s ? `${digits.slice(0, -s)}.${digits.slice(-s)}` : digits
  const signed = minor < 0 ? `-${exact}` : exact
  if (CURRENCIES.has(unit) && s <= 3) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: unit, minimumFractionDigits: s, maximumFractionDigits: s }).format(Number(signed))
    } catch {
      // An unknown code: fall through to the plain form.
    }
  }
  return `${signed} ${unit}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Bytes as KiB or MiB. */
export function bytes(n: number): string {
  if (n < 1024) return plural(n, 'byte')
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1024 / 1024).toFixed(1)} MiB`
}

/** A long id or address shortened for a table cell (the full value stays in the title or a copy button). */
export function short(s: string, keep = 8): string {
  return s.length <= keep * 2 + 1 ? s : `${s.slice(0, keep)}…${s.slice(-4)}`
}
