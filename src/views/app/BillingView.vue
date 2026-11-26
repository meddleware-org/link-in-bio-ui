<script setup lang="ts">
// Billing: how long the page is paid for, the ways to pay this account is offered (the service decides which, by country and
// method), buying months, and past payments. A returning checkout (`/billing?checkout=<id>`) is followed until the service confirms it.
// Vue's reactivity and lifecycle.
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
// The shared button, table, live status, notice and select.
import { UiButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// The billing shape and a checkout's status.
import type { Billing, CheckoutStatus } from '../../api/types.js'
// One started checkout.
import CheckoutPanel from '../../components/CheckoutPanel.vue'
// Refunds.
import RefundsPanel from '../../components/RefundsPanel.vue'
// The app context.
import { useApp } from '../../context.js'
// Read the provider's `client` object into a plan.
import { planCheckout, type CheckoutPlan } from '../../lib/checkout.js'
// Dates, money and plurals for people.
import { day, money, plural, when } from '../../lib/format.js'

// A checkout to follow (the person came back from a payment page), and what an Open Payments wallet added to the return address.
const props = defineProps<{
  returning?: string | null
  /** Back from an Open Payments wallet: what it added to the return address (`hash`, `interact_ref`), or null. */
  openPaymentsReturn?: { hash: string | null; interactRef: string | null } | null
}>()
// The typed API, and a way to re-read who is signed in.
const { api, refreshMe } = useApp()

// The offers, price, history and refund requests as the service reported them.
const billing = shallowRef<Billing | null>(null)
// A failure, in words.
const problem = ref('')
// The way to pay chosen.
const method = ref('')
// How many months to buy.
const months = ref('')
// True while a checkout is being started.
const busy = ref(false)
// The checkout on show: one being followed on return, or one just started.
const checkout = shallowRef<{ id: string; plan: CheckoutPlan | null; follow: boolean } | null>(
  props.returning ? { id: props.returning, plan: null, follow: true } : null,
)

/** Read billing, and keep the chosen way to pay valid. */
async function load(): Promise<void> {
  try {
    billing.value = await api.billing()
    if (!billing.value.offers.some((o) => o.id === method.value)) method.value = billing.value.offers[0]?.id ?? ''
  } catch (e) {
    problem.value = describeError(e)
  }
}
// Load billing, then finish an Open Payments return if there is one.
onMounted(async () => {
  await load()
  await finishOpenPayments()
})

/** Back from the wallet: finish the payment (the service checks the wallet's hash), then follow the checkout as usual. */
/** Back from the wallet: finish the payment (the service checks the wallet's hash), then follow the checkout as usual. */
async function finishOpenPayments(): Promise<void> {
  const back = props.openPaymentsReturn
  // Not a return from a wallet.
  if (!props.returning || !back) return
  // The wallet did not approve: nothing was paid.
  if (!back.hash || !back.interactRef) {
    problem.value = 'The payment was not approved in your wallet, so nothing was paid. You can start again.'
    checkout.value = null
    return
  }
  try {
    // Hand the wallet's values to the service.
    await api.openPaymentsFinish(props.returning, back.hash, back.interactRef)
  } catch (e) {
    problem.value = describeError(e)
  }
}

/** A refund request changed (asked or withdrawn): the history and the paid period follow. */
/** A refund request changed (asked or withdrawn): the history and the paid period follow. */
async function refundsChanged(): Promise<void> {
  await load()
  await refreshMe().catch(() => null)
}

// The chosen way to pay.
const offer = computed(() => billing.value?.offers.find((o) => o.id === method.value) ?? null)
// The months this way allows.
const monthOptions = computed(() => {
  const o = offer.value
  if (!o) return []
  return Array.from({ length: o.maxMonths - o.minMonths + 1 }, (_, i) => {
    const n = o.minMonths + i
    return [String(n), plural(n, 'month')] as const
  })
})
// When the way changes, keep the months within its range.
watch(offer, (o) => {
  if (o && !(Number(months.value) >= o.minMonths && Number(months.value) <= o.maxMonths)) months.value = String(o.minMonths)
})
// The total price for the chosen months.
const total = computed(() => (billing.value && months.value ? money(billing.value.pricePence * Number(months.value), billing.value.currency) : ''))

/** Start a checkout for the chosen way and months. */
async function start(): Promise<void> {
  if (busy.value || !offer.value) return
  busy.value = true
  problem.value = ''
  try {
    // The service makes the checkout and says what the browser must do.
    const r = await api.createCheckout(offer.value.id, Number(months.value))
    checkout.value = { id: r.checkout, plan: planCheckout(r.client), follow: false }
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = false
  }
}

/** A paid checkout changes the paid period: read billing and the account again. */
async function settled(s: CheckoutStatus): Promise<void> {
  if (s.status === 'paid') {
    await load()
    await refreshMe().catch(() => null)
  }
}

// The words for each kind of history line.
const KIND: Record<string, string> = { purchase: 'Payment', grant: 'Given by the service', refund: 'Refund' }
// The words for each refund status.
const REFUND_STATUS: Record<string, string> = { open: 'Requested', refunded: 'Refunded', withdrawn: 'Withdrawn', declined: 'Declined' }
</script>

<template>
  <div class="billing">
    <!-- The view's heading. -->
    <h2>Billing</h2>
    <!-- A failure, in words. -->
    <UiNotice v-if="problem" type="error" :message="problem" />

    <!-- Once the service has answered. -->
    <template v-if="billing">
      <!-- How long the page is paid for, and the price of a month. -->
      <section class="period" aria-labelledby="period-title">
        <h3 id="period-title">Your paid period</h3>
        <p v-if="billing.free">This account is free: there is nothing to pay.</p>
        <p v-else-if="billing.paidUntil">
          Paid until <strong>{{ day(billing.paidUntil) }}</strong>.
          <template v-if="!billing.entitled"> That date has passed, so the page is offline until you pay again.</template>
        </p>
        <p v-else>Not paid yet. A page is published once it is paid for.</p>
        <p>One month costs {{ money(billing.pricePence, billing.currency) }}.</p>
      </section>

      <!-- The checkout, when there is one. -->
      <CheckoutPanel v-if="checkout" :checkout-id="checkout.id" :plan="checkout.plan" :follow="checkout.follow" @settled="settled" />

      <!-- Buying months; nothing to buy for a free account. -->
      <section v-if="!billing.free" class="buy" aria-labelledby="buy-title">
        <h3 id="buy-title">Pay for months</h3>
        <!-- The service's own notes about paying. -->
        <UiNotice v-for="n in billing.notes" :key="n" type="info" :message="n" />
        <!-- The purchase form. -->
        <form v-if="billing.offers.length" class="buy-form" @submit.prevent="start">
          <!-- The ways to pay, as native radio buttons. -->
          <fieldset class="methods">
            <legend>How to pay</legend>
            <label v-for="o in billing.offers" :key="o.id" class="method">
              <input v-model="method" type="radio" name="billing-method" :value="o.id" />
              <span>{{ o.label }} <span class="method-hint">({{ o.minMonths === o.maxMonths ? plural(o.minMonths, 'month') : `${o.minMonths} to ${o.maxMonths} months` }})</span></span>
            </label>
          </fieldset>
          <!-- How many months. -->
          <UiSelectField id="billing-months" v-model="months" label="Months" :options="monthOptions" />
          <!-- The total, before the person continues. -->
          <p v-if="total">Total: <strong>{{ total }}</strong></p>
          <p><UiButton type="submit" :busy="busy" :disabled="!offer">Continue to payment</UiButton></p>
        </form>
      </section>

      <!-- Past payments. -->
      <div class="history">
        <h3 id="history-title">Past payments</h3>
        <p v-if="billing.events.some((e) => e.unapplied)">
          A payment that arrives after its checkout was paid or closed is credited as the months it was for. You can ask for a refund
          of it instead, within 30 days (under Refunds).
        </p>
        <!-- One row per event: payments, gifts and refunds. -->
        <UiDataTable caption="Past payments" :rows="billing.events.length" empty="No payments yet.">
          <template #head>
            <th scope="col">Date</th>
            <th scope="col">What</th>
            <th scope="col">Months</th>
            <th scope="col">Amount</th>
            <th scope="col">Paid until after</th>
            <th scope="col">Refund</th>
          </template>
          <tr v-for="(e, i) in billing.events" :key="i">
            <th scope="row">{{ when(e.at) }}</th>
            <td>{{ KIND[e.kind] ?? e.kind }}</td>
            <td>{{ e.months }}</td>
            <td>{{ e.amountPence ? money(e.amountPence, billing.currency) : '—' }}</td>
            <td>{{ day(e.paidUntil) }}</td>
            <td>{{ e.refundRequest ? (REFUND_STATUS[e.refundRequest.status] ?? e.refundRequest.status) : '—' }}</td>
          </tr>
        </UiDataTable>
      </div>

      <!-- Refunds, for an account that pays. -->
      <RefundsPanel v-if="!billing.free" :history="billing.refundRequests ?? []" @changed="refundsChanged" />
    </template>
    <!-- Loading. -->
    <UiLiveStatus v-else-if="!problem" label="Loading billing" message="Loading…" />
  </div>
</template>

<style scoped>
/* The view and its sections are columns with the shared gap. */
.billing,
.period,
.buy,
.buy-form,
.history,
.methods {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The sections are far apart, and the text keeps a readable width. */
.billing {
  gap: var(--space-lg);
  max-inline-size: var(--mw-content-prose);
}

/* No default margins. */
h2,
h3,
p {
  margin: 0;
}

/* A semi-bold legend. */
.methods legend {
  margin-block-end: var(--space-xs);
  font-weight: var(--font-weight-semibold);
}

/* A radio and its label on one row. */
.method {
  display: flex;
  gap: var(--space-xs);
  align-items: baseline;
  min-block-size: 24px;
}

/* A larger radio in the accent colour. */
.method input {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  accent-color: var(--accent);
}

/* The months range is muted. */
.method-hint {
  color: var(--muted);
}
</style>
