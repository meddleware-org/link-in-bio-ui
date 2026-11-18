<script setup lang="ts">
// Refund requests: a payment that arrived after its checkout closed was credited as months; its holder asked for the money back
// instead. The operator sends the refund by hand from the recipient (same coin and amount, to the paying address) and records it
// here with the transaction's reference, which takes the months back once.
import { onMounted, ref, watch } from 'vue'
import { UiBadge, UiButton, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { RefundRequestRow } from '../../api/types.js'
import { short, when } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api, openAccount } = useConsole()
const filter = ref('open')
const rows = ref<RefundRequestRow[]>([])
const loaded = ref(false)
const forms = ref<Record<string, { reference: string; note: string }>>({})
const status = ref('')
const problem = ref<{ id: string; text: string } | null>(null)
const busy = ref('')

async function load(): Promise<void> {
  try {
    rows.value = (await api.refundRequests(filter.value)).requests
    for (const r of rows.value) forms.value[r.id] ??= { reference: '', note: '' }
  } catch (e) {
    problem.value = { id: '', text: describeError(e) }
  } finally {
    loaded.value = true
  }
}
onMounted(load)
watch(filter, load)

async function record(r: RefundRequestRow): Promise<void> {
  const f = forms.value[r.id]!
  if (busy.value) return
  busy.value = r.id
  problem.value = null
  try {
    await api.recordRefund(r.id, { reference: f.reference.trim(), note: f.note.trim() || undefined })
    status.value = `The refund to ${r.handle} is recorded; its ${r.months} month(s) are taken back.`
    await load()
  } catch (e) {
    problem.value = { id: r.id, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'refunded', label: 'Refunded' },
]
</script>

<template>
  <div class="refunds">
    <h2>Refunds</h2>
    <p>
      Send each refund by hand from the recipient: the same coin and amount as the payment, to the address that paid. Then record its
      transaction here; the months the payment added are taken back once.
    </p>
    <UiSegmentedControl layout="wrap" v-model="filter" :options="FILTERS" label="Show requests that are" :label-hidden="false" />
    <UiNotice v-if="problem && !problem.id" type="error" :message="problem.text" />
    <UiLiveStatus label="Refunds" :message="status" />
    <p v-if="loaded && !rows.length">No {{ filter }} refund requests.</p>

    <article v-for="r in rows" :key="r.id" class="request" :aria-labelledby="`rf-${r.id}`">
      <h3 :id="`rf-${r.id}`">{{ r.handle }}: payment of {{ when(r.paidAt) }}</h3>
      <p class="meta">
        <UiBadge :tone="r.status === 'open' ? 'warn' : 'neutral'">{{ r.status }}</UiBadge>
        <UiButton variant="link" @click="openAccount(r.account)">open the account {{ short(r.account) }}</UiButton>
        · asked {{ when(r.createdAt) }}
      </p>
      <dl class="payment">
        <dt>Refund exactly</dt>
        <dd>
          <code>{{ r.payment?.amount ?? '?' }}</code> of <code>{{ r.payment?.coinType ?? r.provider }}</code>
        </dd>
        <dt>To the address that paid</dt>
        <dd><code>{{ r.payment?.payer ?? 'unknown: check the payment' }}</code></dd>
        <dt>The payment</dt>
        <dd><code>{{ r.payment?.digest ?? '—' }}</code></dd>
        <dt>Months it added</dt>
        <dd>{{ r.months }}</dd>
      </dl>
      <p v-if="r.reason" class="text">{{ r.reason }}</p>
      <p v-if="r.status !== 'open'">Recorded {{ when(r.decidedAt) }} by {{ r.decidedBy }}: <code>{{ r.refundReference }}</code></p>
      <form v-else-if="forms[r.id]" class="decide" @submit.prevent="record(r)">
        <h4>Record the refund</h4>
        <UiTextField :id="`rf-ref-${r.id}`" v-model="forms[r.id]!.reference" label="The refund transaction (digest)" required spellcheck="false" />
        <UiTextField :id="`rf-note-${r.id}`" v-model="forms[r.id]!.note" label="Note (optional)" :rows="2" :maxlength="1000" />
        <p><UiButton type="submit" :busy="busy === r.id" :disabled="!forms[r.id]!.reference.trim()">Record the refund</UiButton></p>
        <UiNotice v-if="problem?.id === r.id" type="error" :message="problem.text" />
      </form>
    </article>
  </div>
</template>

<style scoped>
.refunds,
.request,
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
