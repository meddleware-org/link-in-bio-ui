<script setup lang="ts">
// Appeals against decisions: upheld (the decision is reversed, and the suspension can be lifted with it) or rejected, each with the
// statement the account holder sees.
import { onMounted, ref, watch } from 'vue'
import { UiBadge, UiButton, UiCheckField, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { AppealRow } from '../../api/types.js'
import { short, when } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api, openAccount } = useConsole()
const filter = ref('open')
const appeals = ref<AppealRow[]>([])
const loaded = ref(false)
const forms = ref<Record<string, { status: 'upheld' | 'rejected'; statement: string; reinstate: boolean }>>({})
const status = ref('')
const problem = ref<{ id: string; text: string } | null>(null)
const busy = ref('')

async function load(): Promise<void> {
  try {
    appeals.value = (await api.appeals(filter.value)).appeals
    for (const a of appeals.value) forms.value[a.id] ??= { status: 'rejected', statement: '', reinstate: false }
  } catch (e) {
    problem.value = { id: '', text: describeError(e) }
  } finally {
    loaded.value = true
  }
}
onMounted(load)
watch(filter, load)

async function decide(a: AppealRow): Promise<void> {
  const f = forms.value[a.id]!
  if (busy.value) return
  busy.value = a.id
  problem.value = null
  try {
    await api.decideAppeal(a.id, { status: f.status, statement: f.statement.trim(), reinstate: f.status === 'upheld' && f.reinstate })
    status.value = `The appeal is ${f.status}.`
    await load()
  } catch (e) {
    problem.value = { id: a.id, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'upheld', label: 'Upheld' },
  { id: 'rejected', label: 'Rejected' },
]
const OUTCOMES = [
  { id: 'upheld', label: 'Upheld (reverse the decision)' },
  { id: 'rejected', label: 'Rejected' },
]
</script>

<template>
  <div class="appeals">
    <h2>Appeals</h2>
    <UiSegmentedControl layout="wrap" v-model="filter" :options="FILTERS" label="Show appeals that are" :label-hidden="false" />
    <UiNotice v-if="problem && !problem.id" type="error" :message="problem.text" />
    <UiLiveStatus label="Appeals" :message="status" />
    <p v-if="loaded && !appeals.length">No {{ filter }} appeals.</p>

    <article v-for="a in appeals" :key="a.id" class="appeal" :aria-labelledby="`ap-${a.id}`">
      <h3 :id="`ap-${a.id}`">Appeal of {{ when(a.createdAt) }}</h3>
      <p class="meta">
        <UiBadge :tone="a.status === 'open' ? 'warn' : 'neutral'">{{ a.status }}</UiBadge>
        <UiButton variant="link" @click="openAccount(a.account)">open the account {{ short(a.account) }}</UiButton>
        <template v-if="a.report"> · about report {{ short(a.report) }}</template>
      </p>
      <p class="text">{{ a.text }}</p>
      <p v-if="a.status !== 'open'">Decided {{ when(a.decidedAt) }} by {{ a.decidedBy }}: {{ a.statement }}</p>
      <form v-else-if="forms[a.id]" class="decide" @submit.prevent="decide(a)">
        <h4>Decide</h4>
        <UiSegmentedControl layout="wrap" v-model="forms[a.id]!.status" :options="OUTCOMES" :label="`Outcome for the appeal of ${when(a.createdAt)}`" />
        <UiCheckField v-if="forms[a.id]!.status === 'upheld'" v-model="forms[a.id]!.reinstate" label="Also lift the account’s suspension" />
        <UiTextField :id="`ap-st-${a.id}`" v-model="forms[a.id]!.statement" label="Statement (the holder sees this)" :rows="3" :maxlength="4000" required />
        <p><UiButton type="submit" :busy="busy === a.id" :disabled="!forms[a.id]!.statement.trim()">Record the decision</UiButton></p>
        <UiNotice v-if="problem?.id === a.id" type="error" :message="problem.text" />
      </form>
    </article>
  </div>
</template>

<style scoped>
.appeals,
.appeal,
.decide {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.appeals {
  gap: var(--space-md);
  max-inline-size: var(--mw-content-prose);
}

.appeal {
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

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
