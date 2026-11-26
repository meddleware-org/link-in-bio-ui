<script setup lang="ts">
// Creating an account: a handle, the age declaration, accepting the current terms, an optional country (tax evidence), an invite
// code when sign-up is by invitation, and the way to sign in (a passkey, or a Sui wallet that signs the service's message). The
// service checks every one of these; the form says what it refused.
// Vue's reactivity.
import { computed, ref } from 'vue'
// The shared button, checkboxes, notice, segmented control and fields.
import { UiButton, UiCheckField, UiNotice, UiSegmentedControl, UiSelectField, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// The shapes the two sign-up ways return.
import type { Account, CeremonyStart, WalletChallenge } from '../../api/types.js'
// Make a passkey, and whether the browser can.
import { createPasskey, passkeysSupported } from '../../api/webauthn.js'
// The acceptable-use rules in short.
import AupSummary from '../../components/AupSummary.vue'
// Connect or disconnect the wallet.
import WalletControl from '../../components/WalletControl.vue'
// The deployment's terms link.
import { TERMS_URL } from '../../config.js'
// The app context: the typed API and what the instance offers.
import { useApp } from '../../context.js'
// The country choices.
import { countryOptions } from '../../lib/countries.js'
// Sign a message with the wallet, and the wallet singleton.
import { signMessage, useWallet } from '../../wallet.js'

// Tell the area who signed up, with the one-time recovery codes.
const emit = defineEmits<{ 'signed-in': [account: Account, extra: { recoveryCodes: string[] }] }>()
// The typed API and what the instance offers.
const { api, instance } = useApp()
// The connected wallet account, if any.
const { account } = useWallet()

// The handle chosen.
const handle = ref('')
// The age declaration.
const adult = ref(false)
// Acceptance of the current terms.
const terms = ref(false)
// An optional country, kept as tax evidence.
const country = ref('')
// An invite code, when sign-up is by invitation.
const invite = ref('')
// How the person will sign in: a passkey where the browser can, else a wallet.
const method = ref<'passkey' | 'sui-wallet'>(passkeysSupported() ? 'passkey' : 'sui-wallet')
// An optional name for the passkey.
const passkeyName = ref('')
// True while the account is being made.
const busy = ref(false)
// A refusal or a failure, in words.
const problem = ref('')
// The country choices.
const countries = countryOptions()

// How sign-up is offered; closed until the instance says otherwise.
const mode = computed(() => instance.value?.signup ?? 'closed')
// The age the person must confirm.
const age = computed(() => instance.value?.minimumAge ?? 18)
// The domain pages live under, for the handle's hint.
const pagesDomain = computed(() => instance.value?.pagesDomain ?? '')
// The two ways; the passkey is disabled where the browser cannot.
const methods = computed(() => [
  { id: 'passkey', label: 'Passkey', disabled: !passkeysSupported() },
  { id: 'sui-wallet', label: 'Sui wallet' },
])
// The form is ready when the handle, the confirmations, an invite (when needed) and a way to sign in are all there.
const ready = computed(
  () => handle.value.trim() && adult.value && terms.value && (mode.value !== 'invite' || invite.value.trim()) && (method.value === 'passkey' || account.value),
)

/** Create the account: the service starts a ceremony or a challenge, the person completes it, and the service finishes sign-up. */
async function submit(): Promise<void> {
  // One send at a time, and only once the instance is known.
  if (busy.value || !instance.value) return
  busy.value = true
  problem.value = ''
  try {
    // What every sign-up sends: the handle, the confirmations, the terms version, and the optional country and invite.
    const base = {
      handle: handle.value.trim().toLowerCase(),
      ageConfirmed: adult.value,
      termsAccepted: terms.value,
      termsVersion: instance.value.termsVersion,
      country: country.value || undefined,
      invite: invite.value.trim() || undefined,
    }
    // Passkey: the browser makes it, the service verifies it.
    if (method.value === 'passkey') {
      const start = (await api.signupStart({ ...base, method: 'passkey' })) as CeremonyStart
      const credential = await createPasskey(start.options)
      const r = await api.signupFinish({ challenge: start.challenge, credential, passkeyName: passkeyName.value.trim() || undefined })
      emit('signed-in', r.account, { recoveryCodes: r.recoveryCodes })
    } else {
      // Wallet: the connected address.
      const address = account.value?.address
      // A wallet must be connected first.
      if (!address) throw new Error('Connect a wallet first.')
      const start = (await api.signupStart({ ...base, method: 'sui-wallet', address })) as WalletChallenge
      // The wallet signs the service's message (nothing is spent).
      const signature = await signMessage(start.message)
      const r = await api.signupFinish({ challenge: start.challenge, signature })
      emit('signed-in', r.account, { recoveryCodes: r.recoveryCodes })
    }
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="sign-up">
    <!-- The view's heading. -->
    <h2>Create an account</h2>
    <!-- Sign-up is closed. -->
    <UiNotice v-if="mode === 'closed'" type="info" message="Sign-up is closed at the moment." />

    <!-- The form. -->
    <form v-else class="sign-up-form" @submit.prevent="submit">
      <!-- The rules in short, with the instance's minimum age. -->
      <AupSummary :minimum-age="age" />
      <UiTextField
        id="signup-handle"
        v-model="handle"
        label="Handle"
        :hint="pagesDomain ? `your page will be at ${handle.trim().toLowerCase() || 'handle'}.${pagesDomain}` : 'lowercase letters, digits and hyphens'"
        autocomplete="username"
        spellcheck="false"
        required
      />
      <!-- An invite code, when sign-up is by invitation. -->
      <UiTextField v-if="mode === 'invite'" id="signup-invite" v-model="invite" label="Invite code" spellcheck="false" required />
      <!-- An optional country. -->
      <UiSelectField id="signup-country" v-model="country" label="Country (optional)" placeholder="Not given" :options="countries" hint="where you live, for tax records" />

      <!-- The two confirmations. -->
      <fieldset class="consent">
        <legend>Before you continue</legend>
        <UiCheckField v-model="adult" :label="`I am ${age} or over`" />
        <UiCheckField v-model="terms" :label="`I accept the terms (version ${instance?.termsVersion ?? ''})`" />
        <p v-if="TERMS_URL" class="consent-link">Read the <a :href="TERMS_URL">terms</a>.</p>
      </fieldset>

      <!-- How the person will sign in. -->
      <UiSegmentedControl layout="wrap" v-model="method" :options="methods" label="How you will sign in" :label-hidden="false" />
      <!-- A name for the passkey. -->
      <UiTextField v-if="method === 'passkey'" id="signup-passkey-name" v-model="passkeyName" label="Name for this passkey (optional)" hint="for example, the device it is on" :maxlength="60" />
      <!-- The wallet step. -->
      <div v-else class="wallet-step">
        <p>Your wallet signs a message to create the account. It costs nothing and moves no coins.</p>
        <WalletControl />
      </div>

      <!-- A refusal or a failure. -->
      <UiNotice v-if="problem" type="error" :message="problem" />
      <!-- Create the account, once the form is ready. -->
      <p><UiButton type="submit" :busy="busy" :disabled="!ready">Create the account</UiButton></p>
    </form>
  </div>
</template>

<style scoped>
/* The view, form, consent and wallet step are columns with the shared gap. */
.sign-up,
.sign-up-form,
.consent,
.wallet-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* A semi-bold legend. */
.consent legend {
  margin-block-end: var(--space-xs);
  font-weight: var(--font-weight-semibold);
}

/* No default margins. */
h2,
p {
  margin: 0;
}
</style>
