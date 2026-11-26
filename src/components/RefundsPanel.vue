<script setup lang="ts">
// Refunds: what this account may ask back now, worked out exactly by the service (GET /api/v1/billing/refunds), and the request
// it has open. Within the cancellation window a payment comes back whole, less the days used; after it, only months that have not
// begun; a payment that arrived late may come back whole. Every refund is less the payment provider's fee share, which the provider
// keeps. The operator sends each refund by hand, and its months are taken back then, so access continues until the refund is sent.
// Vue's reactivity and lifecycle.
import { computed, onMounted, ref, shallowRef } from 'vue'
// The shared badge, button, table, live status, notice, select and text field.
import { UiBadge, UiButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The refund shapes.
import type { AccountRefundRequest, RefundAnswer, RefundAsk, RefundKind, RefundLine, RefundOfferLine, Refundable } from '../api/types.js'
// The app context: the typed API.
import { useApp } from '../context.js'
// Amounts, dates and plurals for people.
import { amount, day, plural, when } from '../lib/format.js'

// Every refund request of the account, for the history.
const props = defineProps<{
  /** Every request of the account (from GET /api/v1/billing), for the history. */
  history: AccountRefundRequest[]
}>()
// Tell the parent when a request was made or withdrawn, so it can reload billing.
const emit = defineEmits<{ changed: [] }>()
// The typed API.
const { api } = useApp()

// What may be asked back now, as the service worked it out.
const data = shallowRef<Refundable | null>(null)
// A failed request, in words.
const problem = ref('')
// A confirmation, announced politely.
const status = ref('')
// Which action is in flight (a key), so only that button shows busy and a second click is ignored.
const busy = ref('')
// The reason the person gives (optional).
const reason = ref('')
// How many unstarted months to ask for.
const unstartedMonths = ref('')

/** Ask the service what may be refunded now. */
async function load(): Promise<void> {
  try {
    data.value = await api.refunds()
    // The most unstarted months that can come back.
    const n = data.value.unstarted.months
    // A choice that is out of range falls back to all of them.
    if (!(Number(unstartedMonths.value) >= 1 && Number(unstartedMonths.value) <= n)) unstartedMonths.value = n ? String(n) : ''
  } catch (e) {
    problem.value = describeError(e)
  }
}
onMounted(load)

/** Ask for a refund of one kind; one action at a time. */
async function ask(key: string, b: RefundAsk): Promise<void> {
  // One action at a time.
  if (busy.value) return
  busy.value = key
  problem.value = ''
  try {
    // The reason is trimmed and left out when empty.
    const r = await api.askRefund({ ...b, reason: reason.value.trim() || undefined })
    // Say what was asked and what happens next.
    status.value = `Refund requested: ${total(r.offer.lines)}. The operator sends it by hand; ${plural(r.offer.months, 'month')} ${r.offer.months === 1 ? 'is' : 'are'} taken back when it is sent.`
    reason.value = ''
    // Reload what may be refunded (the open request now exists).
    await load()
    // Tell the parent.
    emit('changed')
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = ''
  }
}

/** Withdraw the open request. */
async function withdraw(id: string): Promise<void> {
  if (busy.value) return
  busy.value = `withdraw-${id}`
  problem.value = ''
  try {
    await api.withdrawRefund(id)
    status.value = 'Your refund request is withdrawn. Nothing was refunded and no month was taken back.'
    await load()
    emit('changed')
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = ''
  }
}

/** The lines' amounts, joined: one per unit (a purchase in another currency or coin is refunded in that). */
function total(lines: RefundOfferLine[]): string {
  return lines.map((l) => amount(l.amountMinor, l.unit, l.scale)).join(' and ') || 'nothing'
}

/** What was taken off, in words, for one line. */
function deductions(l: RefundOfferLine): string {
  const parts: string[] = []
  if (l.daysUsed) parts.push(`${plural(l.daysUsed, 'day')} used (${amount(l.usedMinor, l.unit, l.scale)})`)
  if (l.feeMinor) parts.push(`the payment provider's fee (${amount(l.feeMinor, l.unit, l.scale)})`)
  if (l.chargeMinor) parts.push(`the cost of sending it (${amount(l.chargeMinor, l.unit, l.scale)})`)
  return parts.length ? `less ${parts.join(', ')}` : 'nothing taken off'
}

// The month counts that may be asked for.
const unstartedOptions = computed(() =>
  Array.from({ length: data.value?.unstarted.months ?? 0 }, (_, i) => [String(i + 1), plural(i + 1, 'month')] as const),
)
// The service's answer for asking for all unstarted months.
const unstartedAll = computed<RefundAnswer | null>(() => data.value?.unstarted.all ?? null)
// True when nothing can be refunded and no request is open.
const nothing = computed(() => {
  const d = data.value
  return !!d && !d.openRequest && !d.cancel.length && !d.unapplied.length && !d.unstarted.months
})
// The requests that are no longer open.
const past = computed(() => props.history.filter((r) => r.status !== 'open'))

// The words for each kind of refund.
const KIND: Record<RefundKind, string> = { cancel: 'Cancellation', unstarted: 'Months not started', unapplied: 'Late payment' }
// The words for each status.
const STATUS: Record<AccountRefundRequest['status'], string> = { open: 'Waiting for the operator', refunded: 'Refunded', withdrawn: 'Withdrawn', declined: 'Declined' }
// A badge tone per status.
const tone = (s: AccountRefundRequest['status']) => (s === 'refunded' ? 'ok' : s === 'open' ? 'warn' : 'neutral')
// Whether a line was sent.
const lineStatus = (l: RefundLine) => (l.status === 'refunded' ? `Sent ${day(l.refundedAt)}` : 'To be sent')
</script>

<template>
  <section class="refunds" aria-labelledby="refunds-title">
    <h3 id="refunds-title">Refunds</h3>
    <!-- A failed request. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
    <!-- Announces confirmations. -->
    <UiLiveStatus label="Refunds" :message="status" />

    <!-- Once the service has answered. -->
    <template v-if="data">
      <!-- The refund rules in plain words, with the service's own numbers of days. -->
      <ul class="rules">
        <li>Within {{ data.rules.cancelDays }} days of a payment you can cancel it: it comes back less the days already used.</li>
        <li>After that, months that have not started yet can come back; the month in progress is kept.</li>
        <li>A payment that arrived after its checkout had closed can come back whole within {{ data.rules.unappliedDays }} days.</li>
        <li>
          Every refund is less the payment provider's share of its fee, which the provider keeps. It goes back the way you paid, sent by
          hand; the months are taken back when it is sent, so your page stays online until then.
        </li>
      </ul>

      <!-- The open request, with what will be refunded. -->
      <article v-if="data.openRequest" class="open" aria-labelledby="refund-open-title">
        <h4 id="refund-open-title">Your refund request</h4>
        <p class="meta">
          <UiBadge :tone="tone(data.openRequest.status)">{{ STATUS[data.openRequest.status] }}</UiBadge>
          {{ KIND[data.openRequest.kind] }}, asked {{ when(data.openRequest.at) }}
        </p>
        <!-- Each line: amount, months taken back, how it was worked out, and whether it was sent. -->
        <UiDataTable caption="What will be refunded" :rows="data.openRequest.lines.length" empty="Nothing to send.">
          <template #head>
            <th scope="col">Amount</th>
            <th scope="col">Months taken back</th>
            <th scope="col">Worked out</th>
            <th scope="col">Status</th>
          </template>
          <tr v-for="l in data.openRequest.lines" :key="l.purchase">
            <th scope="row">{{ amount(l.amountMinor, l.unit, l.scale) }}</th>
            <td>{{ l.months }}</td>
            <td>{{ deductions(l) }}</td>
            <td>{{ lineStatus(l) }}</td>
          </tr>
        </UiDataTable>
        <!-- A request can be withdrawn until a refund line has been sent. -->
        <p v-if="!data.openRequest.lines.some((l) => l.status === 'refunded')">
          <UiButton variant="secondary" :busy="busy === `withdraw-${data.openRequest.id}`" @click="withdraw(data.openRequest.id)">
            Withdraw the request
          </UiButton>
        </p>
      </article>

      <!-- No open request: show what may be asked for. -->
      <template v-else>
        <!-- Nothing to ask for. -->
        <p v-if="nothing">Nothing can be refunded now.</p>
        <template v-else>
          <!-- Why, for the operator (optional). -->
          <UiTextField id="refund-reason" v-model="reason" label="Why (optional, for the operator)" :rows="2" :maxlength="1000" />

          <!-- Cancelling a payment within the window. -->
          <div v-if="data.cancel.length" class="choice">
            <h4>Cancel a payment</h4>
            <div v-for="c in data.cancel" :key="c.purchase" class="option">
              <template v-if="c.offer">
                <p>
                  The payment of {{ when(c.at) }}: <strong>{{ total(c.offer.lines) }}</strong> back
                  ({{ c.offer.lines.map(deductions).join('; ') }}). Its {{ plural(c.offer.months, 'month') }} end when the refund is sent.
                </p>
                <p>
                  <UiButton
                    variant="secondary"
                    :busy="busy === `cancel-${c.purchase}`"
                    @click="ask(`cancel-${c.purchase}`, { kind: 'cancel', purchase: c.purchase })"
                  >
                    Cancel the payment of {{ when(c.at) }}
                  </UiButton>
                </p>
              </template>
              <p v-else>The payment of {{ when(c.at) }} cannot be cancelled: {{ c.refused }}</p>
            </div>
          </div>

          <!-- Months that have not started. -->
          <div v-if="data.unstarted.months && unstartedAll" class="choice">
            <h4>Months that have not started</h4>
            <template v-if="unstartedAll.offer">
              <p>
                You have {{ plural(data.unstarted.months, 'month') }} not started yet. All of them come back as
                <strong>{{ total(unstartedAll.offer.lines) }}</strong>, and your paid period would then end {{ day(unstartedAll.offer.until) }}.
                Fewer months come back in proportion; the exact amount is worked out when you ask.
              </p>
              <!-- Choose how many months to have back. -->
              <form class="unstarted-form" @submit.prevent="ask('unstarted', { kind: 'unstarted', months: Number(unstartedMonths) })">
                <UiSelectField id="refund-months" v-model="unstartedMonths" label="Months to have back" :options="unstartedOptions" />
                <p><UiButton type="submit" variant="secondary" :busy="busy === 'unstarted'">Ask for them back</UiButton></p>
              </form>
            </template>
            <p v-else>They cannot be refunded: {{ unstartedAll.refused }}</p>
          </div>

          <!-- Late payments, which may come back whole. -->
          <div v-if="data.unapplied.length" class="choice">
            <h4>Late payments</h4>
            <div v-for="u in data.unapplied" :key="u.purchase" class="option">
              <template v-if="u.offer">
                <p>A payment that arrived after its checkout closed: <strong>{{ total(u.offer.lines) }}</strong> back whole.</p>
                <p>
                  <UiButton
                    variant="secondary"
                    :busy="busy === `unapplied-${u.purchase}`"
                    @click="ask(`unapplied-${u.purchase}`, { kind: 'unapplied', purchase: u.purchase })"
                  >
                    Ask for this payment back
                  </UiButton>
                </p>
              </template>
              <p v-else>A late payment cannot be refunded: {{ u.refused }}</p>
            </div>
          </div>
        </template>
      </template>

      <!-- The history of finished requests. -->
      <UiDataTable v-if="past.length" caption="Past refund requests" :rows="past.length">
        <template #head>
          <th scope="col">Asked</th>
          <th scope="col">What</th>
          <th scope="col">Status</th>
          <th scope="col">Amount</th>
        </template>
        <tr v-for="r in past" :key="r.id">
          <th scope="row">{{ when(r.at) }}</th>
          <td>{{ KIND[r.kind] ?? r.kind }}</td>
          <td>
            {{ STATUS[r.status] ?? r.status }}<template v-if="r.status === 'declined' && typeof r.details?.note === 'string' && r.details.note">: {{ r.details.note }}</template>
          </td>
          <td>{{ r.lines.length ? total(r.lines) : '—' }}</td>
        </tr>
      </UiDataTable>
    </template>
    <!-- Loading. -->
    <UiLiveStatus v-else-if="!problem" label="Loading refunds" message="Loading…" />
  </section>
</template>

<style scoped>
/* The panel and its sections are columns with the shared gap. */
.refunds,
.open,
.choice,
.option,
.unstarted-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* No default margins on headings and paragraphs. */
h3,
h4,
p {
  margin: 0;
}

/* An indented list. */
.rules {
  margin: 0;
  padding-inline-start: var(--space-lg);
}

/* Badge and text on one wrapping row. */
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}
</style>
