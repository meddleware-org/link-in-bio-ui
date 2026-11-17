<script setup lang="ts">
// The wallet: a connect button (the shared dialog), or the connected address with a way to disconnect.
import { UiButton } from '@meddleware/ui'
import { WalletModal } from '@meddleware/wallet-adapter'
import { REQUIRED_FEATURES, useWallet } from '../wallet.js'
import { short } from '../lib/format.js'

withDefaults(defineProps<{ label?: string }>(), { label: 'Connect wallet' })
const { account, disconnect } = useWallet()
</script>

<template>
  <p class="wallet-control">
    <template v-if="account">
      <span>Wallet <code :title="account.address">{{ short(account.address) }}</code></span>
      <UiButton variant="ghost" size="sm" @click="disconnect()">Disconnect</UiButton>
    </template>
    <WalletModal v-else :label="label" :required-features="REQUIRED_FEATURES" />
  </p>
</template>

<style scoped>
.wallet-control {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  margin: 0;
}
</style>
