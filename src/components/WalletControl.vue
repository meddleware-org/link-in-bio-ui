<script setup lang="ts">
// The wallet: a connect button (the shared dialog), or the connected address with a way to disconnect.
// The shared button.
import { UiButton } from '@meddleware/ui'
// The shared dialog that lists wallets and connects one.
import { WalletModal } from '@meddleware/wallet-adapter'
// The features this app needs, and the wallet singleton.
import { REQUIRED_FEATURES, useWallet } from '../wallet.js'
// A long address shortened for display.
import { short } from '../lib/format.js'

// The connect button's label.
withDefaults(defineProps<{ label?: string }>(), { label: 'Connect wallet' })
// The connected account, and how to disconnect.
const { account, disconnect } = useWallet()
</script>

<template>
  <p class="wallet-control">
    <!-- Connected: the shortened address (the full one in its title) and a way out. -->
    <template v-if="account">
      <span>Wallet <code :title="account.address">{{ short(account.address) }}</code></span>
      <UiButton variant="ghost" size="sm" @click="disconnect()">Disconnect</UiButton>
    </template>
    <!-- Not connected: the shared dialog, listing only wallets that offer the required features. -->
    <WalletModal v-else :label="label" :required-features="REQUIRED_FEATURES" />
  </p>
</template>

<style scoped>
/* One wrapping row with no margin. */
.wallet-control {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  margin: 0;
}
</style>
