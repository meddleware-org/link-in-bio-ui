<script setup lang="ts">
// Refund requests: an account holder asked for money back (a cancellation within 14 days, months not started, or a late payment).
// The service worked out exactly what to send per purchase, less the provider's fee share. Nothing is sent automatically: the operator
// sends each line by hand (how is shown per provider) and records it here with its reference, which takes exactly that line's months
// back once. A request can also be declined, with a reason the holder sees. A request from before per-purchase lines (one late
// payment) shows the payment to refund whole.
import { onMounted, ref, watch } from 'vue'
import { UiBadge, UiButton, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { RefundLine, RefundRequestRow } from '../../api/types.js'
import { amount, money, plural, short, when } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api, openAccount } = useConsole()
const filter = ref('open')
const rows = ref<RefundRequestRow[]>([])
const loaded = ref(false)
/** Per line (`request:purchase`, or `request:` for a request without lines): the reference and a note. */
const forms = ref<Record<string, { reference: string; note: string }>>({})
const declines = ref<Record<string, string>>({})
const status = ref('')
const problem = ref<{ id: string; text: string } | null>(null)
const busy = ref('')

const key = (r: RefundRequestRow, l?: RefundLine) => `${r.id}:${l?.purchase ?? ''}`

async function load(): Promise<void> {
  try {
    rows.value = (await api.refundRequests(filter.value)).requests
    for (const r of rows.value) {
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
watch(filter, load)

async function record(r: RefundRequestRow, l?: RefundLine): Promise<void> {
  const k = key(r, l)
  const f = forms.value[k]!
  if (busy.value) return
  busy.value = k
  problem.value = null
  try {
    const done = await api.recordRefund(r.id, { reference: f.reference.trim(), purchase: l?.purchase, note: f.note.trim() || undefined })
    const months = l?.months ?? r.payment?.months ?? 0
    status.value = `The refund to ${r.handle} is recorded; ${plural(months, 'month')} taken back${done.paidUntil ? `, paid until ${when(done.paidUntil)}` : ''}.`
    await load()
  } catch (e) {
    problem.value = { id: k, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}

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

function deductions(l: RefundLine): string {
  const parts: string[] = []
  if (l.daysUsed) parts.push(`${plural(l.daysUsed, 'day')} used: ${amount(l.usedMinor, l.unit, l.scale)}`)
  if (l.feeMinor) parts.push(`fee share: ${amount(l.feeMinor, l.unit, l.scale)}`)
  if (l.chargeMinor) parts.push(`sending charge: ${amount(l.chargeMinor, l.unit, l.scale)}`)
  return parts.join('; ') || 'none'
}

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'declined', label: 'Declined' },
  { id: 'withdrawn', label: 'Withdrawn' },
]
const KIND: Record<string, string> = { cancel: 'cancellation', unstarted: 'months not started', unapplied: 'late payment' }
const tone = (s: string) => (s === 'open' ? 'warn' : 'neutral')
</script>

<template>
  <div class="refunds">
    <h2>Refunds</h2>
    <p>
      Send each refund by hand, exactly as shown, the way the purchase was paid. Then record it here with its reference: that takes back
      exactly the months shown, once. A line the payment provider reports as refunded for exactly its amount closes by itself.
    </p>
    <UiSegmentedControl layout="wrap" v-model="filter" :options="FILTERS" label="Show requests that are" :label-hidden="false" />
    <UiNotice v-if="problem && !problem.id" type="error" :message="problem.text" />
    <UiLiveStatus label="Refunds" :message="status" />
    <p v-if="loaded && !rows.length">No {{ filter }} refund requests.</p>

    <article v-for="r in rows" :key="r.id" class="request" :aria-labelledby="`rf-${r.id}`">
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
      <p v-if="r.reason" class="text">Their reason: {{ r.reason }}</p>

      <section v-for="l in r.lines" :key="l.purchase" class="line" :aria-label="`Purchase ${short(l.purchase)}`">
        <h4>{{ l.provider }}: purchase {{ short(l.purchase) }}</h4>
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
        <p v-if="l.status === 'refunded'">Refunded {{ when(l.refundedAt) }}: <code>{{ l.refundReference }}</code></p>
        <form v-else-if="r.status === 'open' && forms[key(r, l)]" class="decide" @submit.prevent="record(r, l)">
          <UiTextField :id="`rf-ref-${r.id}-${l.purchase}`" v-model="forms[key(r, l)]!.reference" label="The refund's reference" required spellcheck="false" />
          <UiTextField :id="`rf-note-${r.id}-${l.purchase}`" v-model="forms[key(r, l)]!.note" label="Note (optional)" :rows="2" :maxlength="1000" />
          <p>
            <UiButton type="submit" :busy="busy === key(r, l)" :disabled="!forms[key(r, l)]!.reference.trim()">Record this refund</UiButton>
          </p>
          <UiNotice v-if="problem?.id === key(r, l)" type="error" :message="problem.text" />
        </form>
      </section>

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

      <p v-if="r.status !== 'open' && r.decidedAt">
        {{ r.status === 'declined' ? 'Declined' : r.status === 'withdrawn' ? 'Withdrawn' : 'Closed' }} {{ when(r.decidedAt) }}
        <template v-if="r.decidedBy"> by {{ r.decidedBy }}</template>
        <template v-if="typeof r.details?.note === 'string' && r.details.note">: {{ r.details.note }}</template>
        <template v-if="r.refundReference"> · <code>{{ r.refundReference }}</code></template>
      </p>

      <form v-if="r.status === 'open' && !r.lines.some((l) => l.status === 'refunded')" class="decide" @submit.prevent="decline(r)">
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
.refunds,
.request,
.line,
.decide {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.refunds {
  gap: var(--space-md);
  max-inline-size: var(--mw-content-prose);
}

.request {
  padding: var(--space-sm);
  overflow-wrap: anywhere;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.line {
  padding-block-start: var(--space-sm);
  border-block-start: 1px solid var(--border);
}

h2,
h3,
h4,
p {
  margin: 0;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}

.payment {
  margin: 0;
}

.payment dt {
  font-weight: 600;
}

.payment dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
