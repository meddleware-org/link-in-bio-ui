// The instance's network and full node reach the shared wallet adapter: the operator's node for testnet or mainnet, the public one
// when none is given, and an invalid one is refused loudly.
import { describe, expect, it } from 'vitest'
import { rpcUrlFor, useNetwork } from '@meddleware/wallet-adapter'
import { applyInstanceNetwork } from '../src/lib/network.js'

describe('applyInstanceNetwork', () => {
  it("selects the instance's network with its full node", () => {
    applyInstanceNetwork({ suiNetwork: 'mainnet', suiRpcUrl: 'https://sui.example:443' })
    expect(useNetwork().network.value).toBe('mainnet')
    expect(useNetwork().rpcUrl.value).toBe('https://sui.example:443')
    expect(rpcUrlFor('testnet')).toBe('https://fullnode.testnet.sui.io:443')
  })

  it('goes back to the public full node when the instance names none', () => {
    applyInstanceNetwork({ suiNetwork: 'mainnet', suiRpcUrl: null })
    expect(useNetwork().rpcUrl.value).toBe('https://fullnode.mainnet.sui.io:443')
    applyInstanceNetwork({ suiNetwork: 'testnet' })
    expect(useNetwork().rpcUrl.value).toBe('https://fullnode.testnet.sui.io:443')
  })

  it('refuses a full node that is not a plain https URL, and ignores an unknown network', () => {
    expect(() => applyInstanceNetwork({ suiNetwork: 'testnet', suiRpcUrl: 'http://sui.example' })).toThrow(/https URL/)
    const before = useNetwork().network.value
    applyInstanceNetwork({ suiNetwork: 'devnet', suiRpcUrl: 'https://sui.example' })
    expect(useNetwork().network.value).toBe(before)
  })
})
