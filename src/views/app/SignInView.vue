<script setup lang="ts">
// Signing in: with a passkey (with a handle, or letting the browser offer the passkeys it holds for this site), with a Sui wallet
// (it signs the service's sign-in message), or with a one-use recovery code.
// Vue's reactive reference.
import { ref } from 'vue'
// The shared button, notice and text field.
import { UiButton, UiNotice, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// An account as the service reports it.
import type { Account } from '../../api/types.js'
// Run a passkey ceremony, and whether the browser can.
import { getPasskey, passkeysSupported } from '../../api/webauthn.js'
// Connect or disconnect the wallet.
import WalletControl from '../../components/WalletControl.vue'
// The app context: the typed API.
import { useApp } from '../../context.js'
// Sign a message with the wallet, and the wallet singleton.
import { signMessage, useWallet } from '../../wallet.js'

// Tell the area who signed in, and how many recovery codes remain when one was used.
const emit = defineEmits<{ 'signed-in': [account: Account, extra: { recoveryCodesLeft?: number }] }>()
// The typed API.
const { api } = useApp()
// The connected wallet account, if any.
const { account } = useWallet()

// The handle for a passkey sign-in (optional: the browser can offer its own passkeys).
const handle = ref('')
// The handle for a recovery-code sign-in.
const recoveryHandle = ref('')
// The recovery code.
const code = ref('')
// Which way is in flight.
const busy = ref<'' | 'passkey' | 'wallet' | 'recovery'>('')
// A failed attempt, and which way it was.
const problem = ref<{ where: string; text: string } | null>(null)
// Whether this browser can use passkeys.
const supported = passkeysSupported()

/** Run one way of signing in: one at a time, and a failure is said in words under that way. */
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

// Passkey: the service starts a ceremony, the browser asks the authenticator, the service checks the answer.
const withPasskey = () =>
  run('passkey', async () => {
    const start = await api.passkeyLoginStart(handle.value.trim() || undefined)
    const credential = await getPasskey(start.options)
    const r = await api.passkeyLoginFinish({ challenge: start.challenge, credential })
    emit('signed-in', r.account, {})
  })

// Wallet: the service gives a message, the wallet signs it (nothing is spent), the service checks the signature.
const withWallet = () =>
  run('wallet', async () => {
    const address = account.value?.address
    // A wallet must be connected first.
    if (!address) throw new Error('Connect a wallet first.')
    const start = await api.walletLoginStart(address)
    const signature = await signMessage(start.message)
    const r = await api.walletLoginFinish({ challenge: start.challenge, signature })
    emit('signed-in', r.account, {})
  })

// Recovery code: a handle and a one-use code.
const withCode = () =>
  run('recovery', async () => {
    const r = await api.recoveryLogin({ handle: recoveryHandle.value.trim(), code: code.value.trim() })
    emit('signed-in', r.account, { recoveryCodesLeft: r.recoveryCodesLeft })
  })
</script>

<template>
  <div class="sign-in">
    <!-- The view's heading. -->
    <h2>Sign in</h2>

    <!-- With a passkey. -->
    <section class="way" aria-labelledby="way-passkey">
      <h3 id="way-passkey">With a passkey</h3>
      <!-- This browser cannot use passkeys: point to the other ways. -->
      <UiNotice v-if="!supported" type="info" message="This browser cannot use passkeys. Use a wallet or a recovery code instead." />
      <!-- The passkey form. -->
      <form v-else class="way-form" @submit.prevent="withPasskey">
        <UiTextField id="signin-handle" v-model="handle" label="Handle (optional)" hint="leave it empty to choose from the passkeys this device has" autocomplete="username webauthn" />
        <p><UiButton type="submit" :busy="busy === 'passkey'">Sign in with a passkey</UiButton></p>
      </form>
      <!-- A failed passkey attempt. -->
      <UiNotice v-if="problem?.where === 'passkey'" type="error" :message="problem.text" />
    </section>

    <!-- With a Sui wallet. -->
    <section class="way" aria-labelledby="way-wallet">
      <h3 id="way-wallet">With a Sui wallet</h3>
      <p>Your wallet signs a message that says which site you are signing in to. It costs nothing and moves no coins.</p>
      <!-- Connect a wallet. -->
      <WalletControl />
      <p><UiButton :disabled="!account" :busy="busy === 'wallet'" @click="withWallet">Sign in with this wallet</UiButton></p>
      <!-- A failed wallet attempt. -->
      <UiNotice v-if="problem?.where === 'wallet'" type="error" :message="problem.text" />
    </section>

    <!-- With a recovery code. -->
    <section class="way" aria-labelledby="way-recovery">
      <h3 id="way-recovery">With a recovery code</h3>
      <form class="way-form" @submit.prevent="withCode">
        <UiTextField id="recovery-handle" v-model="recoveryHandle" label="Handle" autocomplete="username" required />
        <UiTextField id="recovery-code" v-model="code" label="Recovery code" autocomplete="one-time-code" spellcheck="false" required />
        <p><UiButton type="submit" variant="secondary" :busy="busy === 'recovery'">Sign in with the code</UiButton></p>
      </form>
      <!-- A failed recovery attempt. -->
      <UiNotice v-if="problem?.where === 'recovery'" type="error" :message="problem.text" />
    </section>
  </div>
</template>

<style scoped>
/* The view, each way and each form are columns with the shared gap. */
.sign-in,
.way,
.way-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The ways are far apart. */
.sign-in {
  gap: var(--space-lg);
}

/* No default margins. */
h2,
h3,
p {
  margin: 0;
}
</style>
