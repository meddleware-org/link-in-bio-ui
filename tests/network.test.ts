// The instance's network and full node reach the shared wallet adapter: the operator's node for testnet or mainnet, the public one
// when none is given, and an invalid one is refused loudly.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rpcUrlFor, useNetwork } from '@meddleware/wallet-adapter'
import { applyInstanceNetwork } from '../src/lib/network.js'

describe('applyInstanceNetwork', () => {
  // Selects the instance's network with its full node.
  it("selects the instance's network with its full node", () => {
    applyInstanceNetwork({ suiNetwork: 'mainnet', suiRpcUrl: 'https://sui.example:443' })
    expect(useNetwork().network.value).toBe('mainnet')
    expect(useNetwork().rpcUrl.value).toBe('https://sui.example:443')
    expect(rpcUrlFor('testnet')).toBe('https://fullnode.testnet.sui.io:443')
  })

  // Goes back to the public full node when the instance names none.
  it('goes back to the public full node when the instance names none', () => {
    applyInstanceNetwork({ suiNetwork: 'mainnet', suiRpcUrl: null })
    expect(useNetwork().rpcUrl.value).toBe('https://fullnode.mainnet.sui.io:443')
    applyInstanceNetwork({ suiNetwork: 'testnet' })
    expect(useNetwork().rpcUrl.value).toBe('https://fullnode.testnet.sui.io:443')
  })

  // Refuses a full node that is not a plain https URL, and ignores an unknown network.
  it('refuses a full node that is not a plain https URL, and ignores an unknown network', () => {
    expect(() => applyInstanceNetwork({ suiNetwork: 'testnet', suiRpcUrl: 'http://sui.example' })).toThrow(/https URL/)
    const before = useNetwork().network.value
    applyInstanceNetwork({ suiNetwork: 'devnet', suiRpcUrl: 'https://sui.example' })
    expect(useNetwork().network.value).toBe(before)
  })

  // Stores nothing in the browser for the instance's network (it is not the person's choice: STORAGE_LEDGER B4).
  it("stores nothing in the browser for the instance's network (it is not the person's choice: STORAGE_LEDGER B4)", () => {
    const written: string[] = []
    const storage = { getItem: () => null, setItem: (k: string) => void written.push(k), removeItem: () => {} }
    vi.stubGlobal('sessionStorage', storage)
    vi.stubGlobal('localStorage', storage)
    applyInstanceNetwork({ suiNetwork: 'mainnet' })
    applyInstanceNetwork({ suiNetwork: 'testnet' })
    expect(written).toEqual([])
  })
})

afterEach(() => vi.unstubAllGlobals())
