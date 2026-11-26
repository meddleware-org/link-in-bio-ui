// The instance's network and full node, applied to the shared wallet adapter. The service reports both (`GET /api/v1/instance`:
// `suiNetwork`, and `suiRpcUrl` from its SUI_RPC_URL, the public full node by default); the deployment gives the same origin to this
// app's CSP (static-server's CSP_CONNECT_SRC_EXTRA), so the wallet's requests and the policy agree. The full node is set before the
// network is selected, so the client for the network is never built against another node. An invalid URL throws (the service already
// refuses one), and the app shows the error instead of quietly using another node.
// The shared wallet's network selector and its network type.
import { useNetwork, type MwNetwork } from '@meddleware/wallet-adapter'
// What the instance reports.
import type { Instance } from '../api/types.js'

/** The networks the wallet adapter knows. */
const NETWORKS: readonly string[] = ['testnet', 'mainnet', 'localnet']

/** Apply the instance's network and full node to the shared wallet adapter (see the header). `net` is replaceable in tests. */
export function applyInstanceNetwork(instance: Pick<Instance, 'suiNetwork' | 'suiRpcUrl'>, net = useNetwork()): void {
  // The network the instance asks for.
  const n = instance.suiNetwork
  // An unknown network is left alone.
  if (!NETWORKS.includes(n)) return
  // Set the instance's full node first, so the client for the network is never built against another node.
  if (n === 'testnet' || n === 'mainnet') net.setRpcUrl(n, instance.suiRpcUrl ?? null)
  // The instance's network, not the person's choice: nothing is stored for it (workspace docs/legal STORAGE_LEDGER B4).
  net.setNetwork(n as MwNetwork, { keep: false })
}
