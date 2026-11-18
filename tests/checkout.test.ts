import { describe, expect, it, vi } from 'vitest'
import { httpsHref, pollCheckout, planCheckout, walletAddressValid } from '../src/lib/checkout.js'
import type { CheckoutStatus } from '../src/api/types.js'

const st = (status: CheckoutStatus['status']): CheckoutStatus => ({ checkout: 'c-1', status, months: 1, paidUntil: status === 'paid' ? '2027-01-01T00:00:00Z' : null })
const noSleep = () => Promise.resolve()

describe('following a checkout', () => {
  it('asks until the checkout is paid, then stops', async () => {
    const answers = [st('open'), st('open'), st('paid')]
    const get = vi.fn(async () => answers.shift()!)
    const seen: string[] = []
    const r = await pollCheckout(get, { sleep: noSleep, onStatus: (s) => seen.push(s.status) })
    expect(r?.status).toBe('paid')
    expect(get).toHaveBeenCalledTimes(3)
    expect(seen).toEqual(['open', 'open', 'paid'])
  })

  it('stops on expired or cancelled too', async () => {
    expect((await pollCheckout(async () => st('expired'), { sleep: noSleep }))?.status).toBe('expired')
    expect((await pollCheckout(async () => st('cancelled'), { sleep: noSleep }))?.status).toBe('cancelled')
  })

  it('asks again after a failed question, and gives up on a 404', async () => {
    let n = 0
    const flaky = async () => {
      if (n++ === 0) throw Object.assign(new Error('503'), { status: 503 })
      return st('paid')
    }
    expect((await pollCheckout(flaky, { sleep: noSleep }))?.status).toBe('paid')
    await expect(pollCheckout(async () => Promise.reject(Object.assign(new Error('gone'), { status: 404 })), { sleep: noSleep })).rejects.toThrow('gone')
  })

  it('gives up after the timeout with the last status, waiting the interval between questions', async () => {
    let t = 0
    const sleeps: number[] = []
    const r = await pollCheckout(async () => st('open'), {
      intervalMs: 1000, timeoutMs: 3500, now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms)
        t += ms
      },
    })
    expect(r?.status).toBe('open')
    expect(sleeps).toEqual([1000, 1000, 1000, 1000])
  })

  it('stops when the view goes away', async () => {
    const stop = new AbortController()
    const get = vi.fn(async () => {
      stop.abort()
      return st('open')
    })
    const r = await pollCheckout(get, { signal: stop.signal, sleep: noSleep })
    expect(r?.status).toBe('open')
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('what a started checkout asks for', () => {
  it('Chain Payments: its session and an https origin', () => {
    expect(planCheckout({ kind: 'chain-payments', sessionId: 'cs_1', baseUrl: 'https://pay.example.org' })).toEqual({ kind: 'chain-payments', sessionId: 'cs_1', baseUrl: 'https://pay.example.org/' })
    expect(planCheckout({ kind: 'chain-payments', sessionId: 'cs_1', baseUrl: 'http://pay.example.org' })).toEqual({ kind: 'unsupported' })
  })

  it('a provider’s page: an https URL and the provider’s name in words', () => {
    expect(planCheckout({ kind: 'redirect', url: 'https://pay.example.org/c/1', provider: 'gocardless' })).toEqual({ kind: 'redirect', url: 'https://pay.example.org/c/1', provider: 'GoCardless' })
    expect(planCheckout({ kind: 'redirect', url: 'javascript:alert(1)', provider: 'square' })).toEqual({ kind: 'unsupported' })
    // A payment page is https: not even the development hosts safeHref allows.
    for (const url of ['http://localhost:8080/pay', 'http://127.0.0.1/pay', 'http://pay.example.org/c/1']) {
      expect(planCheckout({ kind: 'redirect', url, provider: 'square' }), url).toEqual({ kind: 'unsupported' })
    }
  })

  it('httpsHref: what safeHref allows, https only', () => {
    expect(httpsHref('https://wallet.example/approve?id=1')).toBe('https://wallet.example/approve?id=1')
    for (const bad of ['http://localhost/approve', 'javascript:alert(1)', 'https://u:p@wallet.example/', '', null, undefined]) expect(httpsHref(bad), String(bad)).toBeNull()
  })

  it('a bank transfer: the details that are there, the amount and the reference', () => {
    const sepa = planCheckout({ kind: 'bank-transfer', scheme: 'sepa', payee: 'Example Ltd', iban: 'DE00 1234', bic: 'EXAMPLEX', sortCode: null, accountNumber: null, amount: '12.00', currency: 'EUR', reference: 'RF18 5390', qr: 'BCD\n002\n1\nSCT' })
    expect(sepa).toEqual({
      kind: 'bank-transfer', scheme: 'a SEPA transfer', amount: '12.00', currency: 'EUR', reference: 'RF18 5390', qr: 'BCD\n002\n1\nSCT',
      details: [{ label: 'Pay to', value: 'Example Ltd' }, { label: 'IBAN', value: 'DE00 1234' }, { label: 'BIC', value: 'EXAMPLEX' }],
    })
    const fp = planCheckout({ kind: 'bank-transfer', scheme: 'faster-payments', payee: 'Example Ltd', iban: null, bic: null, sortCode: '00-00-00', accountNumber: '12345678', amount: '9.00', currency: 'GBP', reference: 'LIB-7', qr: null })
    expect(fp).toMatchObject({ scheme: 'a Faster Payments transfer', qr: null, details: [{ label: 'Pay to', value: 'Example Ltd' }, { label: 'Sort code', value: '00-00-00' }, { label: 'Account number', value: '12345678' }] })
    expect(planCheckout({ kind: 'bank-transfer', payee: 'X', amount: '1', currency: 'GBP', reference: '' })).toEqual({ kind: 'unsupported' })
    expect(planCheckout({ kind: 'bank-transfer', payee: 'X', amount: '1', currency: 'GBP', reference: 'R' })).toEqual({ kind: 'unsupported' })
  })

  it('anything else is unsupported', () => {
    expect(planCheckout({ kind: 'crypto-later' })).toEqual({ kind: 'unsupported' })
    expect(planCheckout(null)).toEqual({ kind: 'unsupported' })
  })
})

describe('Open Payments', () => {
  it('reads the checkout only when the payee is an https wallet address and the amount is given', () => {
    expect(planCheckout({ kind: 'open-payments', step: 'wallet-address', payee: 'https://wallet.example/shop', amount: '6.00', assetCode: 'GBP' })).toEqual({
      kind: 'open-payments', payee: 'https://wallet.example/shop', amount: '6.00', assetCode: 'GBP',
    })
    expect(planCheckout({ kind: 'open-payments', payee: 'javascript:alert(1)', amount: '6.00', assetCode: 'GBP' })).toEqual({ kind: 'unsupported' })
    expect(planCheckout({ kind: 'open-payments', payee: 'https://wallet.example/shop', assetCode: 'GBP' })).toEqual({ kind: 'unsupported' })
  })

  it('accepts https wallet addresses and $ payment pointers only', () => {
    expect(walletAddressValid('https://wallet.example/alice')).toBe(true)
    expect(walletAddressValid(' $wallet.example/alice ')).toBe(true)
    expect(walletAddressValid('http://wallet.example/alice')).toBe(false)
    expect(walletAddressValid('https://user:pw@wallet.example/alice')).toBe(false)
    expect(walletAddressValid('alice')).toBe(false)
    expect(walletAddressValid('')).toBe(false)
  })
})

