import { describe, expect, it } from 'vitest'
import { SUI_PACKAGES } from '@meddleware/chain-payments-client/sui'
import { TESTNET_PACKAGE } from '../e2e/open.js'

describe('the end-to-end fixture', () => {
  it('names the client release’s testnet package (the client refuses any other)', () => {
    expect(TESTNET_PACKAGE).toBe(SUI_PACKAGES.testnet)
  })
})
