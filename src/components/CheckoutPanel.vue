<script setup lang="ts">
// One started checkout, whatever the provider asks for: the Chain Payments widget (paid from the connected wallet), a provider's own
// payment page (a plain link: the person pays there and comes back to `/billing?checkout=<id>`), or a bank transfer's details. The
// account is paid only when the service says so, so the panel then asks the service until the checkout is no longer open.
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { UiButton, UiCodeBlock, UiCopyButton, UiLiveStatus, UiNotice, UiTextField } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { CheckoutStatus } from '../api/types.js'
import { useApp } from '../context.js'
import { httpsHref, pollCheckout, walletAddressValid, type CheckoutPlan } from '../lib/checkout.js'
import { day } from '../lib/format.js'
import { getSuiClient, signAndExecute } from '../wallet.js'
import WalletControl from './WalletControl.vue'

const props = withDefaults(defineProps<{ checkoutId: string; plan: CheckoutPlan | null; follow?: boolean; pollMs?: number }>(), {
  follow: false,
  pollMs: 3000,
})
const emit = defineEmits<{ settled: [status: CheckoutStatus] }>()

const ChainCheckout = defineAsyncComponent(async () => (await import('@meddleware/chain-payments-kit')).ChainCheckout)

const { api } = useApp()
const result = ref<CheckoutStatus | null>(null)
const following = ref(false)
const stillOpen = ref(false)
const problem = ref('')
const kitProblem = ref('')
let stop: AbortController | null = null

async function watchPayment(): Promise<void> {
  stop?.abort()
  stop = new AbortController()
  following.value = true
  stillOpen.value = false
  problem.value = ''
  try {
    const last = await pollCheckout(() => api.checkout(props.checkoutId), { intervalMs: props.pollMs, signal: stop.signal })
    result.value = last
    if (last && last.status !== 'open') emit('settled', last)
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

onMounted(() => {
  if (props.follow) void watchPayment()
})
onBeforeUnmount(() => stop?.abort())

// Open Payments: the person names their wallet; the service asks that wallet for a quote and an approval, then the browser goes
// to the wallet to approve it (a full-page navigation, never a frame). The wallet sends the person back to /billing.
const wallet = ref('')
const walletBusy = ref(false)
const walletProblem = ref('')
async function toWallet(): Promise<void> {
  walletProblem.value = ''
  if (!walletAddressValid(wallet.value)) {
    walletProblem.value = 'Enter your wallet address: https://… or a payment pointer starting with $.'
    return
  }
  walletBusy.value = true
  try {
    const r = await api.openPaymentsWallet(props.checkoutId, wallet.value.trim())
    const to = httpsHref(r.redirect)
    if (!to) {
      walletProblem.value = 'Your wallet did not give an https address to approve the payment at, so this page did not go there.'
      walletBusy.value = false
      return
    }
    window.location.assign(to)
  } catch (e) {
    walletProblem.value = describeError(e)
    walletBusy.value = false
  }
}

// The kit says why a payment did not count (`rejected`, `unapplied`) and shows its own notice for each, in words; the panel adds
// nothing then. A reason it does not know is said in words too, never as the bare code.
const KIT_EXPLAINS = new Set(['rejected', 'unapplied'])
function kitFailed(reason: string): void {
  kitProblem.value = KIT_EXPLAINS.has(reason) ? '' : 'The payment did not complete. Check your wallet’s history before you try again.'
}

const sign = (tx: unknown) => signAndExecute(tx as Parameters<typeof signAndExecute>[0])
// The kit reads the platform fee from the chain with the wallet adapter's client, before the wallet opens.
const suiClient = getSuiClient()
</script>

<template>
  <section class="checkout" aria-labelledby="checkout-title">
    <h3 id="checkout-title">Paying</h3>

    <template v-if="result && result.status !== 'open'">
      <UiNotice v-if="result.status === 'paid'" type="ok" :message="`Paid. Your page is paid until ${day(result.paidUntil)}.`" />
      <UiNotice v-else type="warning" :message="`This checkout ${result.status === 'expired' ? 'expired' : 'was cancelled'} without a payment. Start a new one when you are ready.`" />
    </template>

    <template v-else-if="plan?.kind === 'chain-payments'">
      <p>Pay from your Sui wallet. The amount is shown before you sign, and it is held for a short time.</p>
      <WalletControl />
      <ChainCheckout
        :session-id="plan.sessionId"
        :base-url="plan.baseUrl"
        :sui-client="suiClient"
        :sign-and-execute="sign"
        :level="4"
        @paid="watchPayment"
        @failed="kitFailed"
      />
      <UiNotice v-if="kitProblem" type="error" :message="kitProblem" />
    </template>

    <template v-else-if="plan?.kind === 'redirect'">
      <p>You pay on {{ plan.provider }}’s own page. When you have paid, it sends you back here, and this page shows when the payment is confirmed.</p>
      <p><UiButton :href="plan.url">Continue to {{ plan.provider }}</UiButton></p>
    </template>

    <template v-else-if="plan?.kind === 'bank-transfer'">
      <p>Pay by {{ plan.scheme }} from your own bank, with these details.</p>
      <dl class="bank">
        <template v-for="d in plan.details" :key="d.label">
          <dt>{{ d.label }}</dt>
          <dd><code>{{ d.value }}</code> <UiCopyButton :value="d.value" :label="`Copy the ${d.label}`" /></dd>
        </template>
        <dt>Amount</dt>
        <dd><code>{{ plan.amount }} {{ plan.currency }}</code> <UiCopyButton :value="plan.amount" label="Copy the amount" /></dd>
      </dl>
      <div class="reference">
        <p class="reference-lead"><strong>Use exactly this reference</strong></p>
        <p class="reference-value"><code>{{ plan.reference }}</code> <UiCopyButton :value="plan.reference" label="Copy the reference" /></p>
        <p>The transfer is matched to your account by its reference alone. It can take up to a working day to arrive.</p>
      </div>
      <div v-if="plan.qr" class="qr">
        <p>The same payment as a QR payload (EPC). Many banking apps can scan it when it is shown as a QR code; this app shows the text.</p>
        <UiCodeBlock :code="plan.qr" label="EPC payment payload" />
      </div>
      <p><UiButton variant="secondary" @click="checkOnce">Check whether it has arrived</UiButton></p>
    </template>

    <template v-else-if="plan?.kind === 'open-payments'">
      <p>
        Pay {{ plan.amount }} {{ plan.assetCode }} from an Open Payments wallet. Your wallet shows the exact amount and asks you to
        approve it, then sends you back here.
      </p>
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

    <UiNotice v-else-if="plan" type="info" message="This payment method is not available in this app yet." />

    <UiLiveStatus label="Payment" :message="following ? 'Waiting for the service to confirm the payment…' : ''" />
    <template v-if="stillOpen && plan?.kind !== 'bank-transfer'">
      <UiNotice type="info" message="The payment is not confirmed yet. It can take a few minutes." />
      <p><UiButton variant="secondary" @click="watchPayment">Check again</UiButton></p>
    </template>
    <UiNotice v-if="stillOpen && plan?.kind === 'bank-transfer'" type="info" message="Not arrived yet." />
    <UiNotice v-if="problem" type="error" :message="problem" />
  </section>
</template>

<style scoped>
.checkout,
.reference,
.qr {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.checkout h3,
.checkout p {
  margin: 0;
}

.bank {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-2xs) var(--space-md);
  margin: 0;
}

.bank dt {
  font-weight: var(--font-weight-semibold);
}

.bank dd {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
  align-items: center;
  margin: 0;
  overflow-wrap: anywhere;
}

.reference {
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--accent);
  border-radius: var(--radius);
}

.reference-value {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  font-size: var(--font-size-lg);
}
</style>
