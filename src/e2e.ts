// End-to-end build only (`vite build --mode e2e`; main.ts loads this when MODE is `e2e` and VITE_E2E is `1`, both static, so every other
// build drops it). A mock wallet is registered like an extension, with a stub chain client whose transactions succeed. The service is
// answered by the specs (`page.route`).
import { MOCK_ADDRESS, createStubClient, installE2eWallet, okTransaction } from '@meddleware/wallet-adapter/testing'
import { SUI_PACKAGES, SUI_PLATFORM_CONFIGS } from '@meddleware/chain-payments-client/sui'

export function installE2e(): void {
  // The chain objects the checkout reads: the testnet PlatformConfig of the built-in Chain Payments package (0.2 %).
  const platformConfig = {
    objectId: SUI_PLATFORM_CONFIGS.testnet!,
    type: `${SUI_PACKAGES.testnet}::chain_payments::PlatformConfig`,
    json: { fee_bps: '20', treasury: MOCK_ADDRESS },
  }
  installE2eWallet({
    address: MOCK_ADDRESS,
    client: createStubClient({
      executed: okTransaction(`E2E${'a'.repeat(41)}`),
      objects: { [platformConfig.objectId]: platformConfig },
    }),
  })
}
