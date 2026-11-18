<script setup lang="ts">
// Billing: how long the page is paid for, the ways to pay this account is offered (the service decides which, by country and
// method), buying months, and past payments. A returning checkout (`/billing?checkout=<id>`) is followed until the service confirms it.
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { UiButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { Billing, CheckoutStatus } from '../../api/types.js'
import CheckoutPanel from '../../components/CheckoutPanel.vue'
import { useApp } from '../../context.js'
import { planCheckout, type CheckoutPlan } from '../../lib/checkout.js'
import { day, money, plural, when } from '../../lib/format.js'

const props = defineProps<{
  returning?: string | null
  /** Back from an Open Payments wallet: what it added to the return address (`hash`, `interact_ref`), or null. */
  openPaymentsReturn?: { hash: string | null; interactRef: string | null } | null
}>()
const { api, refreshMe } = useApp()

const billing = shallowRef<Billing | null>(null)
const problem = ref('')
const method = ref('')
const months = ref('')
const busy = ref(false)
const checkout = shallowRef<{ id: string; plan: CheckoutPlan | null; follow: boolean } | null>(
  props.returning ? { id: props.returning, plan: null, follow: true } : null,
)

async function load(): Promise<void> {
  try {
    billing.value = await api.billing()
    if (!billing.value.offers.some((o) => o.id === method.value)) method.value = billing.value.offers[0]?.id ?? ''
  } catch (e) {
    problem.value = describeError(e)
  }
}
onMounted(async () => {
  await load()
  await finishOpenPayments()
})

/** Back from the wallet: finish the payment (the service checks the wallet's hash), then follow the checkout as usual. */
async function finishOpenPayments(): Promise<void> {
  const back = props.openPaymentsReturn
  if (!props.returning || !back) return
  if (!back.hash || !back.interactRef) {
    problem.value = 'The payment was not approved in your wallet, so nothing was paid. You can start again.'
    checkout.value = null
    return
  }
  try {
    await api.openPaymentsFinish(props.returning, back.hash, back.interactRef)
  } catch (e) {
    problem.value = describeError(e)
  }
}

/** Refund requests for payments that arrived after their checkout closed (credited as months unless a refund is asked for). */
const refundBusy = ref('')
const refundDone = ref('')
async function askRefund(eventId: string): Promise<void> {
  refundBusy.value = eventId
  problem.value = ''
  try {
    await api.refundRequest(eventId)
    refundDone.value = 'Refund requested. The months it added are taken back when the refund is sent.'
    await load()
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    refundBusy.value = ''
  }
}

const offer = computed(() => billing.value?.offers.find((o) => o.id === method.value) ?? null)
const monthOptions = computed(() => {
  const o = offer.value
  if (!o) return []
  return Array.from({ length: o.maxMonths - o.minMonths + 1 }, (_, i) => {
    const n = o.minMonths + i
    return [String(n), plural(n, 'month')] as const
  })
})
watch(offer, (o) => {
  if (o && !(Number(months.value) >= o.minMonths && Number(months.value) <= o.maxMonths)) months.value = String(o.minMonths)
})
const total = computed(() => (billing.value && months.value ? money(billing.value.pricePence * Number(months.value), billing.value.currency) : ''))

async function start(): Promise<void> {
  if (busy.value || !offer.value) return
  busy.value = true
  problem.value = ''
  try {
    const r = await api.createCheckout(offer.value.id, Number(months.value))
    checkout.value = { id: r.checkout, plan: planCheckout(r.client), follow: false }
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = false
  }
}

async function settled(s: CheckoutStatus): Promise<void> {
  if (s.status === 'paid') {
    await load()
    await refreshMe().catch(() => null)
  }
}

const KIND: Record<string, string> = { purchase: 'Payment', grant: 'Given by the service', refund: 'Refund' }
</script>

<template>
  <div class="billing">
    <h2>Billing</h2>
    <UiNotice v-if="problem" type="error" :message="problem" />

    <template v-if="billing">
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

      <CheckoutPanel v-if="checkout" :checkout-id="checkout.id" :plan="checkout.plan" :follow="checkout.follow" @settled="settled" />

      <section v-if="!billing.free" class="buy" aria-labelledby="buy-title">
        <h3 id="buy-title">Pay for months</h3>
        <UiNotice v-for="n in billing.notes" :key="n" type="info" :message="n" />
        <form v-if="billing.offers.length" class="buy-form" @submit.prevent="start">
          <fieldset class="methods">
            <legend>How to pay</legend>
            <label v-for="o in billing.offers" :key="o.id" class="method">
              <input v-model="method" type="radio" name="billing-method" :value="o.id" />
              <span>{{ o.label }} <span class="method-hint">({{ o.minMonths === o.maxMonths ? plural(o.minMonths, 'month') : `${o.minMonths} to ${o.maxMonths} months` }})</span></span>
            </label>
          </fieldset>
          <UiSelectField id="billing-months" v-model="months" label="Months" :options="monthOptions" />
          <p v-if="total">Total: <strong>{{ total }}</strong></p>
          <p><UiButton type="submit" :busy="busy" :disabled="!offer">Continue to payment</UiButton></p>
        </form>
      </section>

      <div class="history">
        <h3 id="history-title">Past payments</h3>
        <p v-if="billing.events.some((e) => e.unapplied)">
          A payment that arrives after its checkout was paid or closed is credited as the months it was for. You can ask for a refund
          of it instead, within 30 days.
        </p>
        <UiNotice v-if="refundDone" type="ok" :message="refundDone" />
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
            <td>
              <template v-if="e.refundRequest">{{ e.refundRequest.status === 'refunded' ? 'Refunded' : 'Requested' }}</template>
              <UiButton
                v-else-if="e.refundableUntil"
                variant="secondary"
                :busy="refundBusy === e.id"
                :aria-label="`Ask for a refund of the payment of ${when(e.at)} (arrived after its checkout closed; possible until ${day(e.refundableUntil)})`"
                @click="askRefund(e.id)"
              >
                Ask for a refund
              </UiButton>
              <template v-else>—</template>
            </td>
          </tr>
        </UiDataTable>
      </div>
    </template>
    <UiLiveStatus v-else-if="!problem" label="Loading billing" message="Loading…" />
  </div>
</template>

<style scoped>
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

.billing {
  gap: var(--space-lg);
  max-inline-size: var(--mw-content-prose);
}

h2,
h3,
p {
  margin: 0;
}

.methods legend {
  margin-block-end: var(--space-xs);
  font-weight: var(--font-weight-semibold);
}

.method {
  display: flex;
  gap: var(--space-xs);
  align-items: baseline;
  min-block-size: 24px;
}

.method input {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  accent-color: var(--accent);
}

.method-hint {
  color: var(--muted);
}
</style>
