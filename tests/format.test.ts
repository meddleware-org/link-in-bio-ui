// Amounts in any unit, exactly: currencies as money, coins as their exact decimal (never rounded to a float's precision).
import { describe, expect, it } from 'vitest'
import { amount } from '../src/lib/format.js'

describe('amount', () => {
  // Shows a currency as money, with its own decimals.
  it('shows a currency as money, with its own decimals', () => {
    expect(amount(1052, 'GBP', 2)).toBe('£10.52')
    expect(amount(5, 'GBP', 2)).toBe('£0.05')
    expect(amount(1500, 'JPY', 0)).toBe('JP¥1,500')
  })

  // Shows a coin exactly, with its symbol.
  it('shows a coin exactly, with its symbol', () => {
    expect(amount(3965894, 'USDC', 6)).toBe('3.965894 USDC')
    expect(amount(1, 'SUI', 9)).toBe('0.000000001 SUI')
    expect(amount(2_500_000_000, 'SUI', 9)).toBe('2.500000000 SUI')
    expect(amount(42, 'XYZ', null)).toBe('42 XYZ')
    expect(amount(1_000_000_000, 'SUI', 9)).toBe('1.000000000 SUI')
  })

  // Keeps the sign of a negative amount.
  it('keeps the sign of a negative amount', () => {
    expect(amount(-250, 'USDC', 6)).toBe('-0.000250 USDC')
  })
})
