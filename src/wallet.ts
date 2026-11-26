// The app's wallet: the shared @meddleware/wallet-adapter singleton. Signing in and linking a wallet need `sui:signPersonalMessage`; paying
// through Chain Payments needs `sui:signTransaction`, so only wallets that offer both are listed.
// The shared wallet singleton's factory.
import { createToolWallet } from '@meddleware/wallet-adapter'

/** The wallet features this app needs: sign a message (sign-in, linking) and sign a transaction (paying through Chain Payments). */
export const REQUIRED_FEATURES = ['sui:signPersonalMessage', 'sui:signTransaction']

// The shared singleton, bound to this app's required features.
export const { useWallet, getSuiClient, signPersonalMessage, signAndExecute } = createToolWallet({
  requiredFeatures: REQUIRED_FEATURES,
})

/** Sign the service's sign-in (or link) message as a Sui personal message; resolves with the serialised signature. */
export async function signMessage(message: string): Promise<string> {
  const { signature } = await signPersonalMessage(new TextEncoder().encode(message))
  return signature
}
