// End-to-end build only (`vite build --mode e2e`; main.ts loads this when MODE is `e2e` and VITE_E2E is `1`, both static, so every other
// build drops it). A mock wallet is registered like an extension, with a stub chain client whose transactions succeed. The service is
// answered by the specs (`page.route`).
// The mock wallet's address and the stub client and installer from wallet-adapter's testing entry.
import { MOCK_ADDRESS, createStubClient, installE2eWallet, okTransaction } from '@meddleware/wallet-adapter/testing'
// The built-in Chain Payments package and PlatformConfig ids per network.
import { SUI_PACKAGES, SUI_PLATFORM_CONFIGS } from '@meddleware/chain-payments-client/sui'

/** Install the mock wallet and the stub chain on the page (called from main.ts in the end-to-end build only). */
export function installE2e(): void {
  // The chain objects the checkout reads: the testnet PlatformConfig of the built-in Chain Payments package (0.2 %).
  // A PlatformConfig object as the chain returns it.
  const platformConfig = {
    objectId: SUI_PLATFORM_CONFIGS.testnet!,
    type: `${SUI_PACKAGES.testnet}::chain_payments::PlatformConfig`,
    json: { fee_bps: '20', treasury: MOCK_ADDRESS },
  }
  // Register the mock wallet like an extension, with a stub client.
  installE2eWallet({
    address: MOCK_ADDRESS,
    client: createStubClient({
      // Every transaction succeeds.
      executed: okTransaction(`E2E${'a'.repeat(41)}`),
      // The one object the checkout reads.
      objects: { [platformConfig.objectId]: platformConfig },
    }),
  })
}
