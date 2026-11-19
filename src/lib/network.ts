// The instance's network and full node, applied to the shared wallet adapter. The service reports both (`GET /api/v1/instance`:
// `suiNetwork`, and `suiRpcUrl` from its SUI_RPC_URL, the public full node by default); the deployment gives the same origin to this
// app's CSP (static-server's CSP_CONNECT_SRC_EXTRA), so the wallet's requests and the policy agree. The full node is set before the
// network is selected, so the client for the network is never built against another node. An invalid URL throws (the service already
// refuses one), and the app shows the error instead of quietly using another node.
import { useNetwork, type MwNetwork } from '@meddleware/wallet-adapter'
import type { Instance } from '../api/types.js'

const NETWORKS: readonly string[] = ['testnet', 'mainnet', 'localnet']

export function applyInstanceNetwork(instance: Pick<Instance, 'suiNetwork' | 'suiRpcUrl'>, net = useNetwork()): void {
  const n = instance.suiNetwork
  if (!NETWORKS.includes(n)) return
  if (n === 'testnet' || n === 'mainnet') net.setRpcUrl(n, instance.suiRpcUrl ?? null)
  net.setNetwork(n as MwNetwork)
}
