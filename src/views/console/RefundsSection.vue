<script setup lang="ts">
// The service worked out exactly what to send per purchase, less the provider's fee share. Nothing is sent automatically: the operator
// sends each line by hand (how is shown per provider) and records it here with its reference, which takes exactly that line's months
// back once. A request can also be declined, with a reason the holder sees. A request from before per-purchase lines (one late
// payment) shows the payment to refund whole.
// Vue's lifecycle and reactivity.
import { onMounted, ref, watch } from 'vue'
// The shared badge, button, live status, notice, segmented control and text field.
import { UiBadge, UiButton, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// A refund line and a request.
import type { RefundLine, RefundRequestRow } from '../../api/types.js'
// Amounts, dates and plurals for people.
import { amount, money, plural, short, when } from '../../lib/format.js'
// The console context: the API and a way to open an account.
import { useConsole } from './console.js'

// The typed operator API, and a way to open an account in the accounts section.
const { api, openAccount } = useConsole()
// Which requests to show.
const filter = ref('open')
// The requests.
const rows = ref<RefundRequestRow[]>([])
// True once a read has finished.
const loaded = ref(false)
/** Per line (`request:purchase`, or `request:` for a request without lines): the reference and a note. */
const forms = ref<Record<string, { reference: string; note: string }>>({})
// The decline reason being typed, by request.
const declines = ref<Record<string, string>>({})
// A polite announcement of what was done.
const status = ref('')
// A failure, and which form it belongs to.
const problem = ref<{ id: string; text: string } | null>(null)
// Which action is in flight.
const busy = ref('')

// The key of a line's form: the request and the purchase.
const key = (r: RefundRequestRow, l?: RefundLine) => `${r.id}:${l?.purchase ?? ''}`

/** Read the requests and make a form for each line. */
async function load(): Promise<void> {
  try {
    rows.value = (await api.refundRequests(filter.value)).requests
    for (const r of rows.value) {
      // A request without lines (one late payment, from before lines existed) has one form of its own.
      for (const l of r.lines.length ? r.lines : [undefined]) forms.value[key(r, l)] ??= { reference: '', note: '' }
      declines.value[r.id] ??= ''
    }
  } catch (e) {
    problem.value = { id: '', text: describeError(e) }
  } finally {
    loaded.value = true
  }
}
onMounted(load)
// Read again when the filter changes.
watch(filter, load)

/** Record that a refund was sent by hand, with its reference (takes exactly that line's months back, once). */
async function record(r: RefundRequestRow, l?: RefundLine): Promise<void> {
  const k = key(r, l)
  const f = forms.value[k]!
  if (busy.value) return
  busy.value = k
  problem.value = null
  try {
    const done = await api.recordRefund(r.id, { reference: f.reference.trim(), purchase: l?.purchase, note: f.note.trim() || undefined })
    // The months taken back.
    const months = l?.months ?? r.payment?.months ?? 0
    status.value = `The refund to ${r.handle} is recorded; ${plural(months, 'month')} taken back${done.paidUntil ? `, paid until ${when(done.paidUntil)}` : ''}.`
    await load()
  } catch (e) {
    problem.value = { id: k, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}

/** Decline the request, with a reason the holder sees; nothing is refunded. */
async function decline(r: RefundRequestRow): Promise<void> {
  if (busy.value) return
  busy.value = `decline-${r.id}`
  problem.value = null
  try {
    await api.declineRefund(r.id, { reason: declines.value[r.id]!.trim() })
    status.value = `The request from ${r.handle} is declined; nothing was refunded.`
    await load()
  } catch (e) {
    problem.value = { id: `decline-${r.id}`, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}

/** The provider's identifiers in a line's destination (everything but the instructions), for finding the payment. */
function identifiers(l: RefundLine): Array<[string, string]> {
  return Object.entries(l.destination)
    .filter(([k, v]) => k !== 'how' && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
}

/** What was taken off a line, in words. */
function deductions(l: RefundLine): string {
  const parts: string[] = []
  if (l.daysUsed) parts.push(`${plural(l.daysUsed, 'day')} used: ${amount(l.usedMinor, l.unit, l.scale)}`)
  if (l.feeMinor) parts.push(`fee share: ${amount(l.feeMinor, l.unit, l.scale)}`)
  if (l.chargeMinor) parts.push(`sending charge: ${amount(l.chargeMinor, l.unit, l.scale)}`)
  return parts.join('; ') || 'none'
}

// The four filters.
const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'declined', label: 'Declined' },
  { id: 'withdrawn', label: 'Withdrawn' },
]
// The words for each kind of request.
const KIND: Record<string, string> = { cancel: 'cancellation', unstarted: 'months not started', unapplied: 'late payment' }
/** A badge tone per status. */
const tone = (s: string) => (s === 'open' ? 'warn' : 'neutral')
</script>

<template>
  <div class="refunds">
    <!-- The section's heading. -->
    <h2>Refunds</h2>
    <p>
      Send each refund by hand, exactly as shown, the way the purchase was paid. Then record it here with its reference: that takes back
      exactly the months shown, once. A line the payment provider reports as refunded for exactly its amount closes by itself.
    </p>
    <!-- Which requests to show. -->
    <UiSegmentedControl layout="wrap" v-model="filter" :options="FILTERS" label="Show requests that are" :label-hidden="false" />
    <UiNotice v-if="problem && !problem.id" type="error" :message="problem.text" />
    <UiLiveStatus label="Refunds" :message="status" />
    <!-- None to show. -->
    <p v-if="loaded && !rows.length">No {{ filter }} refund requests.</p>

    <!-- One card per request. -->
    <article v-for="r in rows" :key="r.id" class="request" :aria-labelledby="`rf-${r.id}`">
      <!-- Who asked, for what, and when. -->
      <h3 :id="`rf-${r.id}`">{{ r.handle }}: {{ KIND[r.kind] ?? r.kind }}, asked {{ when(r.createdAt) }}</h3>
      <p class="meta">
        <UiBadge :tone="tone(r.status)">{{ r.status }}</UiBadge>
        <UiButton variant="link" @click="openAccount(r.account)">open the account {{ short(r.account) }}</UiButton>
        <template v-if="r.details?.until"> · would end the paid period {{ when(r.details.until) }}</template>
      </p>
      <UiNotice
        v-if="r.monthStarted"
        type="warning"
        message="The first of these months has begun since this was asked, so the request no longer matches what is unstarted. Decline it; the holder can ask again."
      />
      <!-- The holder's reason. -->
      <p v-if="r.reason" class="text">Their reason: {{ r.reason }}</p>

      <!-- One section per purchase line. -->
      <section v-for="l in r.lines" :key="l.purchase" class="line" :aria-label="`Purchase ${short(l.purchase)}`">
        <!-- One line: which provider's purchase it is about. -->
        <h4>{{ l.provider }}: purchase {{ short(l.purchase) }}</h4>
        <!-- What to send, how, and the provider's identifiers. -->
        <dl class="payment">
          <dt>Send exactly</dt>
          <dd><strong>{{ amount(l.amountMinor, l.unit, l.scale) }}</strong> <code>({{ l.amount }} {{ l.unit }})</code></dd>
          <dt>Taken off</dt>
          <dd>{{ deductions(l) }}</dd>
          <dt>Months taken back</dt>
          <dd>{{ l.months }} (the purchase has {{ l.purchaseMonthsLeft }} left)</dd>
          <dt>How</dt>
          <dd>{{ l.destination.how ?? 'Send the refund by hand.' }}</dd>
          <template v-for="[k, v] in identifiers(l)" :key="k">
            <dt>{{ k }}</dt>
            <dd><code>{{ v }}</code></dd>
          </template>
        </dl>
        <!-- A line already sent. -->
        <p v-if="l.status === 'refunded'">Refunded {{ when(l.refundedAt) }}: <code>{{ l.refundReference }}</code></p>
        <!-- Recording the refund of this line. -->
        <form v-else-if="r.status === 'open' && forms[key(r, l)]" class="decide" @submit.prevent="record(r, l)">
          <!-- The refund's reference, as the provider or the chain reports it. -->
          <UiTextField :id="`rf-ref-${r.id}-${l.purchase}`" v-model="forms[key(r, l)]!.reference" label="The refund's reference" required spellcheck="false" />
          <UiTextField :id="`rf-note-${r.id}-${l.purchase}`" v-model="forms[key(r, l)]!.note" label="Note (optional)" :rows="2" :maxlength="1000" />
          <p>
            <UiButton type="submit" :busy="busy === key(r, l)" :disabled="!forms[key(r, l)]!.reference.trim()">Record this refund</UiButton>
          </p>
          <UiNotice v-if="problem?.id === key(r, l)" type="error" :message="problem.text" />
        </form>
      </section>

      <!-- An old request without lines: the payment to refund whole. -->
      <template v-if="!r.lines.length && r.payment">
        <dl class="payment">
          <dt>Refund exactly</dt>
          <dd>
            <code>{{ r.payment.amount ?? '?' }}</code> of <code>{{ r.payment.coinType ?? r.payment.provider }}</code>
            <template v-if="r.payment.amountPence"> ({{ money(r.payment.amountPence) }})</template>
          </dd>
          <dt>To the address that paid</dt>
          <dd><code>{{ r.payment.payer ?? 'unknown: check the payment' }}</code></dd>
          <dt>The payment</dt>
          <dd><code>{{ r.payment.digest ?? '—' }}</code>, {{ when(r.payment.paidAt) }}</dd>
          <dt>Months it added</dt>
          <dd>{{ r.payment.months ?? '?' }}</dd>
        </dl>
        <form v-if="r.status === 'open' && forms[key(r)]" class="decide" @submit.prevent="record(r)">
          <UiTextField :id="`rf-ref-${r.id}`" v-model="forms[key(r)]!.reference" label="The refund transaction (digest)" required spellcheck="false" />
          <UiTextField :id="`rf-note-${r.id}`" v-model="forms[key(r)]!.note" label="Note (optional)" :rows="2" :maxlength="1000" />
          <p><UiButton type="submit" :busy="busy === key(r)" :disabled="!forms[key(r)]!.reference.trim()">Record the refund</UiButton></p>
          <UiNotice v-if="problem?.id === key(r)" type="error" :message="problem.text" />
        </form>
      </template>

      <!-- How a closed request ended, and by whom. -->
      <p v-if="r.status !== 'open' && r.decidedAt">
        {{ r.status === 'declined' ? 'Declined' : r.status === 'withdrawn' ? 'Withdrawn' : 'Closed' }} {{ when(r.decidedAt) }}
        <template v-if="r.decidedBy"> by {{ r.decidedBy }}</template>
        <template v-if="typeof r.details?.note === 'string' && r.details.note">: {{ r.details.note }}</template>
        <template v-if="r.refundReference"> · <code>{{ r.refundReference }}</code></template>
      </p>

      <!-- Declining, until a line has been sent. -->
      <form v-if="r.status === 'open' && !r.lines.some((l) => l.status === 'refunded')" class="decide" @submit.prevent="decline(r)">
        <!-- The reason the holder sees. -->
        <UiTextField :id="`rf-decline-${r.id}`" v-model="declines[r.id]!" label="Decline: the reason (the holder sees this)" :rows="2" :maxlength="1000" required />
        <p>
          <UiButton type="submit" variant="secondary" :busy="busy === `decline-${r.id}`" :disabled="!declines[r.id]?.trim()">Decline the request</UiButton>
        </p>
        <UiNotice v-if="problem?.id === `decline-${r.id}`" type="error" :message="problem.text" />
      </form>
    </article>
  </div>
</template>

<style scoped>
/* The section, each request, each line and each form are columns with the shared gap. */
.refunds,
.request,
.line,
.decide {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The cards are spaced and keep a readable width. */
.refunds {
  gap: var(--space-md);
  max-inline-size: var(--mw-content-prose);
}

/* A bordered card whose text may wrap anywhere. */
.request {
  padding: var(--space-sm);
  overflow-wrap: anywhere;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

/* Each line is separated by a rule. */
.line {
  padding-block-start: var(--space-sm);
  border-block-start: 1px solid var(--border);
}

/* No default margins. */
h2,
h3,
h4,
p {
  margin: 0;
}

/* Status and links on one wrapping row. */
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}

/* The payment details as a description list. */
.payment {
  margin: 0;
}

/* Labels are semi-bold. */
.payment dt {
  font-weight: 600;
}

/* Values may break anywhere. */
.payment dd {
  margin: 0;
  overflow-wrap: anywhere;
}

/* The holder's words keep their line breaks. */
.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
