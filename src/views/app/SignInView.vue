<script setup lang="ts">
// Signing in: with a passkey (with a handle, or letting the browser offer the passkeys it holds for this site), with a Sui wallet
// (it signs the service's sign-in message), or with a one-use recovery code.
import { ref } from 'vue'
import { UiButton, UiNotice, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { Account } from '../../api/types.js'
import { getPasskey, passkeysSupported } from '../../api/webauthn.js'
import WalletControl from '../../components/WalletControl.vue'
import { useApp } from '../../context.js'
import { signMessage, useWallet } from '../../wallet.js'

const emit = defineEmits<{ 'signed-in': [account: Account, extra: { recoveryCodesLeft?: number }] }>()
const { api } = useApp()
const { account } = useWallet()

const handle = ref('')
const recoveryHandle = ref('')
const code = ref('')
const busy = ref<'' | 'passkey' | 'wallet' | 'recovery'>('')
const problem = ref<{ where: string; text: string } | null>(null)
const supported = passkeysSupported()

async function run(where: 'passkey' | 'wallet' | 'recovery', f: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = where
  problem.value = null
  try {
    await f()
  } catch (e) {
    problem.value = { where, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}

const withPasskey = () =>
  run('passkey', async () => {
    const start = await api.passkeyLoginStart(handle.value.trim() || undefined)
    const credential = await getPasskey(start.options)
    const r = await api.passkeyLoginFinish({ challenge: start.challenge, credential })
    emit('signed-in', r.account, {})
  })

const withWallet = () =>
  run('wallet', async () => {
    const address = account.value?.address
    if (!address) throw new Error('Connect a wallet first.')
    const start = await api.walletLoginStart(address)
    const signature = await signMessage(start.message)
    const r = await api.walletLoginFinish({ challenge: start.challenge, signature })
    emit('signed-in', r.account, {})
  })

const withCode = () =>
  run('recovery', async () => {
    const r = await api.recoveryLogin({ handle: recoveryHandle.value.trim(), code: code.value.trim() })
    emit('signed-in', r.account, { recoveryCodesLeft: r.recoveryCodesLeft })
  })
</script>

<template>
  <div class="sign-in">
    <h2>Sign in</h2>

    <section class="way" aria-labelledby="way-passkey">
      <h3 id="way-passkey">With a passkey</h3>
      <UiNotice v-if="!supported" type="info" message="This browser cannot use passkeys. Use a wallet or a recovery code instead." />
      <form v-else class="way-form" @submit.prevent="withPasskey">
        <UiTextField id="signin-handle" v-model="handle" label="Handle (optional)" hint="leave it empty to choose from the passkeys this device has" autocomplete="username webauthn" />
        <p><UiButton type="submit" :busy="busy === 'passkey'">Sign in with a passkey</UiButton></p>
      </form>
      <UiNotice v-if="problem?.where === 'passkey'" type="error" :message="problem.text" />
    </section>

    <section class="way" aria-labelledby="way-wallet">
      <h3 id="way-wallet">With a Sui wallet</h3>
      <p>Your wallet signs a message that says which site you are signing in to. It costs nothing and moves no coins.</p>
      <WalletControl />
      <p><UiButton :disabled="!account" :busy="busy === 'wallet'" @click="withWallet">Sign in with this wallet</UiButton></p>
      <UiNotice v-if="problem?.where === 'wallet'" type="error" :message="problem.text" />
    </section>

    <section class="way" aria-labelledby="way-recovery">
      <h3 id="way-recovery">With a recovery code</h3>
      <form class="way-form" @submit.prevent="withCode">
        <UiTextField id="recovery-handle" v-model="recoveryHandle" label="Handle" autocomplete="username" required />
        <UiTextField id="recovery-code" v-model="code" label="Recovery code" autocomplete="one-time-code" spellcheck="false" required />
        <p><UiButton type="submit" variant="secondary" :busy="busy === 'recovery'">Sign in with the code</UiButton></p>
      </form>
      <UiNotice v-if="problem?.where === 'recovery'" type="error" :message="problem.text" />
    </section>
  </div>
</template>

<style scoped>
.sign-in,
.way,
.way-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.sign-in {
  gap: var(--space-lg);
}

h2,
h3,
p {
  margin: 0;
}
</style>
