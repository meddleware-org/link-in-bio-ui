<script setup lang="ts">
// One started checkout, whatever the provider asks for: the Chain Payments widget (paid from the connected wallet), a provider's own
// payment page (a plain link: the person pays there and comes back to `/billing?checkout=<id>`), or a bank transfer's details. The
// account is paid only when the service says so, so the panel then asks the service until the checkout is no longer open.
// Vue's lifecycle, reactivity and lazy components.
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
// The shared button, code block, copy button, live status, notice and text field.
import { UiButton, UiCodeBlock, UiCopyButton, UiLiveStatus, UiNotice, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// A checkout's status.
import type { CheckoutStatus } from '../api/types.js'
// The app context: the typed API and what the instance offers.
import { useApp } from '../context.js'
// Polling, the https-only link check and the wallet-address check, and the plan's type.
import { httpsHref, pollCheckout, walletAddressValid, type CheckoutPlan } from '../lib/checkout.js'
// A date for people.
import { day } from '../lib/format.js'
// The wallet's chain client and signing.
import { getSuiClient, signAndExecute } from '../wallet.js'
// Connect or disconnect the wallet.
import WalletControl from './WalletControl.vue'

// The checkout id, what to do for it (the plan), whether to follow it at once, and the polling interval.
const props = withDefaults(defineProps<{ checkoutId: string; plan: CheckoutPlan | null; follow?: boolean; pollMs?: number }>(), {
  follow: false,
  pollMs: 3000,
})
// Tell the parent when the checkout is no longer open.
const emit = defineEmits<{ settled: [status: CheckoutStatus] }>()

// The Chain Payments widget, loaded only when a checkout needs it.
const ChainCheckout = defineAsyncComponent(async () => (await import('@meddleware/chain-payments-kit')).ChainCheckout)

// The typed API and what the instance offers.
const { api, instance } = useApp()
// The last status the service gave.
const result = ref<CheckoutStatus | null>(null)
// True while the panel is asking the service.
const following = ref(false)
// True when the time ran out and the checkout is still open.
const stillOpen = ref(false)
// A failed question, in words.
const problem = ref('')
// A sentence for a payment that did not complete.
const kitProblem = ref('')
// Aborts the current polling.
let stop: AbortController | null = null

/** Ask the service until the checkout is no longer open, the time runs out or the panel goes away. */
async function watchPayment(): Promise<void> {
  // Only one polling at a time.
  stop?.abort()
  stop = new AbortController()
  following.value = true
  stillOpen.value = false
  problem.value = ''
  try {
    // Ask at the given interval; a settled answer ends it.
    const last = await pollCheckout(() => api.checkout(props.checkoutId), { intervalMs: props.pollMs, signal: stop.signal })
    result.value = last
    // A final answer: tell the parent.
    if (last && last.status !== 'open') emit('settled', last)
    // Out of time: say it is not confirmed yet.
    else if (!stop.signal.aborted) stillOpen.value = true
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    following.value = false
  }
}

/** One question, for a bank transfer (it can take a working day; nothing is gained by asking every few seconds). */
async function checkOnce(): Promise<void> {
  problem.value = ''
  try {
    const s = await api.checkout(props.checkoutId)
    result.value = s
    stillOpen.value = s.status === 'open'
    if (s.status !== 'open') emit('settled', s)
  } catch (e) {
    problem.value = describeError(e)
  }
}

// Follow the checkout straight away when asked to (back from a provider's page).
onMounted(() => {
  if (props.follow) void watchPayment()
})
// Stop asking when the panel goes away.
onBeforeUnmount(() => stop?.abort())

// Open Payments: the person names their wallet; the service asks that wallet for a quote and an approval, then the browser goes
// to the wallet to approve it (a full-page navigation, never a frame). The wallet sends the person back to /billing.
// The wallet address the person typed.
const wallet = ref('')
// True while the wallet step is in flight.
const walletBusy = ref(false)
// A problem with the address or the step, in words.
const walletProblem = ref('')
/** Send the typed wallet address to the service, then go to the wallet's approval page. */
async function toWallet(): Promise<void> {
  walletProblem.value = ''
  // An address must be https or a `$` pointer.
  if (!walletAddressValid(wallet.value)) {
    walletProblem.value = 'Enter your wallet address: https://… or a payment pointer starting with $.'
    return
  }
  walletBusy.value = true
  try {
    // The service asks that wallet for a quote and an approval, and answers where to approve it.
    const r = await api.openPaymentsWallet(props.checkoutId, wallet.value.trim())
    // Only an https address is followed.
    const to = httpsHref(r.redirect)
    if (!to) {
      walletProblem.value = 'Your wallet did not give an https address to approve the payment at, so this page did not go there.'
      walletBusy.value = false
      return
    }
    // A full-page navigation, never a frame.
    window.location.assign(to)
  } catch (e) {
    walletProblem.value = describeError(e)
    walletBusy.value = false
  }
}

// The kit says why a payment did not count (`rejected`, `unapplied`) and shows its own notice for each, in words; the panel adds
// nothing then. A reason it does not know is said in words too, never as the bare code.
// The reasons the kit already explains in its own notice.
const KIT_EXPLAINS = new Set(['rejected', 'unapplied'])
/** Show a sentence for a reason the kit did not explain. */
function kitFailed(reason: string): void {
  kitProblem.value = KIT_EXPLAINS.has(reason) ? '' : 'The payment did not complete. Check your wallet’s history before you try again.'
}

// The kit's signer, typed for the wallet adapter.
const sign = (tx: unknown) => signAndExecute(tx as Parameters<typeof signAndExecute>[0])
// The kit reads the platform fee from the chain with the wallet adapter's client, before the wallet opens.
// The chain client the kit reads the platform fee with.
const suiClient = getSuiClient()
</script>

<template>
  <section class="checkout" aria-labelledby="checkout-title">
    <!-- Its heading. -->
    <h3 id="checkout-title">Paying</h3>

    <!-- A final answer from the service. -->
    <template v-if="result && result.status !== 'open'">
      <!-- Paid, with the new paid-until date. -->
      <UiNotice v-if="result.status === 'paid'" type="ok" :message="`Paid. Your page is paid until ${day(result.paidUntil)}.`" />
      <!-- Expired or cancelled without a payment. -->
      <UiNotice v-else type="warning" :message="`This checkout ${result.status === 'expired' ? 'expired' : 'was cancelled'} without a payment. Start a new one when you are ready.`" />
    </template>

    <!-- Pay from the connected wallet. -->
    <template v-else-if="plan?.kind === 'chain-payments'">
      <p>Pay from your Sui wallet. The amount is shown before you sign, and it is held for a short time.</p>
      <WalletControl />
      <!-- The widget; it reads the fee from the chain, asks the wallet to sign and reports `paid` or `failed`. -->
      <ChainCheckout
        :session-id="plan.sessionId"
        :base-url="plan.baseUrl"
        :sui-client="suiClient"
        :sign-and-execute="sign"
        :level="4"
        :network="instance?.suiNetwork"
        @paid="watchPayment"
        @failed="kitFailed"
      />
      <UiNotice v-if="kitProblem" type="error" :message="kitProblem" />
    </template>

    <!-- Pay on the provider's own page. -->
    <template v-else-if="plan?.kind === 'redirect'">
      <p>You pay on {{ plan.provider }}’s own page. When you have paid, it sends you back here, and this page shows when the payment is confirmed.</p>
      <p><UiButton :href="plan.url">Continue to {{ plan.provider }}</UiButton></p>
    </template>

    <!-- Pay by bank transfer. -->
    <template v-else-if="plan?.kind === 'bank-transfer'">
      <p>Pay by {{ plan.scheme }} from your own bank, with these details.</p>
      <!-- The account details as a description list, each with a copy button. -->
      <dl class="bank">
        <template v-for="d in plan.details" :key="d.label">
          <dt>{{ d.label }}</dt>
          <dd><code>{{ d.value }}</code> <UiCopyButton :value="d.value" :label="`Copy the ${d.label}`" /></dd>
        </template>
        <dt>Amount</dt>
        <dd><code>{{ plan.amount }} {{ plan.currency }}</code> <UiCopyButton :value="plan.amount" label="Copy the amount" /></dd>
      </dl>
      <!-- The reference, which alone matches the transfer to the account. -->
      <div class="reference">
        <p class="reference-lead"><strong>Use exactly this reference</strong></p>
        <p class="reference-value"><code>{{ plan.reference }}</code> <UiCopyButton :value="plan.reference" label="Copy the reference" /></p>
        <p>The transfer is matched to your account by its reference alone. It can take up to a working day to arrive.</p>
      </div>
      <!-- The EPC payload, as text. -->
      <div v-if="plan.qr" class="qr">
        <p>The same payment as a QR payload (EPC). Many banking apps can scan it when it is shown as a QR code; this app shows the text.</p>
        <UiCodeBlock :code="plan.qr" label="EPC payment payload" />
      </div>
      <p><UiButton variant="secondary" @click="checkOnce">Check whether it has arrived</UiButton></p>
    </template>

    <!-- Pay from an Open Payments wallet. -->
    <template v-else-if="plan?.kind === 'open-payments'">
      <p>
        Pay {{ plan.amount }} {{ plan.assetCode }} from an Open Payments wallet. Your wallet shows the exact amount and asks you to
        approve it, then sends you back here.
      </p>
      <!-- The wallet address form. -->
      <form class="wallet" novalidate @submit.prevent="toWallet">
        <UiTextField
          id="op-wallet"
          v-model="wallet"
          label="Your wallet address"
          hint="For example https://wallet.example/alice or $wallet.example/alice"
          autocomplete="off"
          spellcheck="false"
          :error="walletProblem"
        />
        <p><UiButton type="submit" :busy="walletBusy">Continue to your wallet</UiButton></p>
      </form>
    </template>

    <!-- A kind this app cannot handle. -->
    <UiNotice v-else-if="plan" type="info" message="This payment method is not available in this app yet." />

    <!-- Announces that the app is waiting for the service. -->
    <UiLiveStatus label="Payment" :message="following ? 'Waiting for the service to confirm the payment…' : ''" />
    <!-- Not confirmed yet: offer to check again. -->
    <template v-if="stillOpen && plan?.kind !== 'bank-transfer'">
      <UiNotice type="info" message="The payment is not confirmed yet. It can take a few minutes." />
      <p><UiButton variant="secondary" @click="watchPayment">Check again</UiButton></p>
    </template>
    <!-- A bank transfer has not arrived yet. -->
    <UiNotice v-if="stillOpen && plan?.kind === 'bank-transfer'" type="info" message="Not arrived yet." />
    <!-- A failed question. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
  </section>
</template>

<style scoped>
/* The panel, the reference and the QR are columns with the shared gap. */
.checkout,
.reference,
.qr {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* No default margins on the heading and paragraphs. */
.checkout h3,
.checkout p {
  margin: 0;
}

/* The bank details as two columns. */
.bank {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-2xs) var(--space-md);
  margin: 0;
}

/* Labels are semi-bold. */
.bank dt {
  font-weight: var(--font-weight-semibold);
}

/* Values wrap, with their copy button. */
.bank dd {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
  align-items: center;
  margin: 0;
  overflow-wrap: anywhere;
}

/* The reference is boxed in the accent colour, because it must be used exactly. */
.reference {
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--accent);
  border-radius: var(--radius);
}

/* The reference value is large, with its copy button. */
.reference-value {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  font-size: var(--font-size-lg);
}
</style>
