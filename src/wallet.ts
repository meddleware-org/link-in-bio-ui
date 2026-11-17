// The app's wallet: the shared @meddleware/wallet-adapter singleton. Signing in and linking a wallet need `sui:signPersonalMessage`; paying
// through Chain Payments needs `sui:signTransaction`, so only wallets that offer both are listed.
import { createToolWallet } from '@meddleware/wallet-adapter'

export const REQUIRED_FEATURES = ['sui:signPersonalMessage', 'sui:signTransaction']

export const { useWallet, getSuiClient, signPersonalMessage, signAndExecute } = createToolWallet({
  requiredFeatures: REQUIRED_FEATURES,
})

/** Sign the service's sign-in (or link) message as a Sui personal message; resolves with the serialised signature. */
export async function signMessage(message: string): Promise<string> {
  const { signature } = await signPersonalMessage(new TextEncoder().encode(message))
  return signature
}
