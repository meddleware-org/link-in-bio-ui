<script setup lang="ts">
// Creating an account: a handle, the age declaration, accepting the current terms, an optional country (tax evidence), an invite
// code when sign-up is by invitation, and the way to sign in (a passkey, or a Sui wallet that signs the service's message). The
// service checks every one of these; the form says what it refused.
import { computed, ref } from 'vue'
import { UiButton, UiCheckField, UiNotice, UiSegmentedControl, UiSelectField, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { Account, CeremonyStart, WalletChallenge } from '../../api/types.js'
import { createPasskey, passkeysSupported } from '../../api/webauthn.js'
import AupSummary from '../../components/AupSummary.vue'
import WalletControl from '../../components/WalletControl.vue'
import { TERMS_URL } from '../../config.js'
import { useApp } from '../../context.js'
import { countryOptions } from '../../lib/countries.js'
import { signMessage, useWallet } from '../../wallet.js'

const emit = defineEmits<{ 'signed-in': [account: Account, extra: { recoveryCodes: string[] }] }>()
const { api, instance } = useApp()
const { account } = useWallet()

const handle = ref('')
const adult = ref(false)
const terms = ref(false)
const country = ref('')
const invite = ref('')
const method = ref<'passkey' | 'sui-wallet'>(passkeysSupported() ? 'passkey' : 'sui-wallet')
const passkeyName = ref('')
const busy = ref(false)
const problem = ref('')
const countries = countryOptions()

const mode = computed(() => instance.value?.signup ?? 'closed')
const age = computed(() => instance.value?.minimumAge ?? 18)
const pagesDomain = computed(() => instance.value?.pagesDomain ?? '')
const methods = computed(() => [
  { id: 'passkey', label: 'Passkey', disabled: !passkeysSupported() },
  { id: 'sui-wallet', label: 'Sui wallet' },
])
const ready = computed(
  () => handle.value.trim() && adult.value && terms.value && (mode.value !== 'invite' || invite.value.trim()) && (method.value === 'passkey' || account.value),
)

async function submit(): Promise<void> {
  if (busy.value || !instance.value) return
  busy.value = true
  problem.value = ''
  try {
    const base = {
      handle: handle.value.trim().toLowerCase(),
      ageConfirmed: adult.value,
      termsAccepted: terms.value,
      termsVersion: instance.value.termsVersion,
      country: country.value || undefined,
      invite: invite.value.trim() || undefined,
    }
    if (method.value === 'passkey') {
      const start = (await api.signupStart({ ...base, method: 'passkey' })) as CeremonyStart
      const credential = await createPasskey(start.options)
      const r = await api.signupFinish({ challenge: start.challenge, credential, passkeyName: passkeyName.value.trim() || undefined })
      emit('signed-in', r.account, { recoveryCodes: r.recoveryCodes })
    } else {
      const address = account.value?.address
      if (!address) throw new Error('Connect a wallet first.')
      const start = (await api.signupStart({ ...base, method: 'sui-wallet', address })) as WalletChallenge
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
    <h2>Create an account</h2>
    <UiNotice v-if="mode === 'closed'" type="info" message="Sign-up is closed at the moment." />

    <form v-else class="sign-up-form" @submit.prevent="submit">
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
      <UiTextField v-if="mode === 'invite'" id="signup-invite" v-model="invite" label="Invite code" spellcheck="false" required />
      <UiSelectField id="signup-country" v-model="country" label="Country (optional)" placeholder="Not given" :options="countries" hint="where you live, for tax records" />

      <fieldset class="consent">
        <legend>Before you continue</legend>
        <UiCheckField v-model="adult" :label="`I am ${age} or over`" />
        <UiCheckField v-model="terms" :label="`I accept the terms (version ${instance?.termsVersion ?? ''})`" />
        <p v-if="TERMS_URL" class="consent-link">Read the <a :href="TERMS_URL">terms</a>.</p>
      </fieldset>

      <UiSegmentedControl layout="wrap" v-model="method" :options="methods" label="How you will sign in" :label-hidden="false" />
      <UiTextField v-if="method === 'passkey'" id="signup-passkey-name" v-model="passkeyName" label="Name for this passkey (optional)" hint="for example, the device it is on" :maxlength="60" />
      <div v-else class="wallet-step">
        <p>Your wallet signs a message to create the account. It costs nothing and moves no coins.</p>
        <WalletControl />
      </div>

      <UiNotice v-if="problem" type="error" :message="problem" />
      <p><UiButton type="submit" :busy="busy" :disabled="!ready">Create the account</UiButton></p>
    </form>
  </div>
</template>

<style scoped>
.sign-up,
.sign-up-form,
.consent,
.wallet-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.consent legend {
  margin-block-end: var(--space-xs);
  font-weight: var(--font-weight-semibold);
}

h2,
p {
  margin: 0;
}
</style>
