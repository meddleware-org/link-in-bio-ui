<script setup lang="ts">
// Appeals against decisions: upheld (the decision is reversed, and the suspension can be lifted with it) or rejected, each with the
// statement the account holder sees.
// Vue's lifecycle and reactivity.
import { onMounted, ref, watch } from 'vue'
// The shared badge, button, checkbox, live status, notice, segmented control and text field.
import { UiBadge, UiButton, UiCheckField, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// One appeal.
import type { AppealRow } from '../../api/types.js'
// Shortened ids and dates for people.
import { short, when } from '../../lib/format.js'
// The console context: the API and a way to open an account.
import { useConsole } from './console.js'

// The typed operator API, and a way to open an account in the accounts section.
const { api, openAccount } = useConsole()
// Which appeals to show.
const filter = ref('open')
// The appeals.
const appeals = ref<AppealRow[]>([])
// True once a read has finished, so "none" is not shown while loading.
const loaded = ref(false)
// One decision form per appeal.
const forms = ref<Record<string, { status: 'upheld' | 'rejected'; statement: string; reinstate: boolean }>>({})
// A polite announcement of what was done.
const status = ref('')
// A failure, and which appeal it belongs to.
const problem = ref<{ id: string; text: string } | null>(null)
// Which appeal is being decided.
const busy = ref('')

/** Read the appeals for the filter and make a form for each new one. */
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
// Read again when the filter changes.
watch(filter, load)

/** Record the decision for one appeal. */
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

// The three filters.
const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'upheld', label: 'Upheld' },
  { id: 'rejected', label: 'Rejected' },
]
// The two outcomes.
const OUTCOMES = [
  { id: 'upheld', label: 'Upheld (reverse the decision)' },
  { id: 'rejected', label: 'Rejected' },
]
</script>

<template>
  <div class="appeals">
    <!-- The section's heading. -->
    <h2>Appeals</h2>
    <!-- Which appeals to show. -->
    <UiSegmentedControl layout="wrap" v-model="filter" :options="FILTERS" label="Show appeals that are" :label-hidden="false" />
    <!-- A failed read. -->
    <UiNotice v-if="problem && !problem.id" type="error" :message="problem.text" />
    <UiLiveStatus label="Appeals" :message="status" />
    <!-- None to show. -->
    <p v-if="loaded && !appeals.length">No {{ filter }} appeals.</p>

    <!-- One card per appeal. -->
    <article v-for="a in appeals" :key="a.id" class="appeal" :aria-labelledby="`ap-${a.id}`">
      <h3 :id="`ap-${a.id}`">Appeal of {{ when(a.createdAt) }}</h3>
      <!-- Status, a link to the account and the report it is about. -->
      <p class="meta">
        <UiBadge :tone="a.status === 'open' ? 'warn' : 'neutral'">{{ a.status }}</UiBadge>
        <UiButton variant="link" @click="openAccount(a.account)">open the account {{ short(a.account) }}</UiButton>
        <template v-if="a.report"> · about report {{ short(a.report) }}</template>
      </p>
      <!-- What the account holder wrote. -->
      <p class="text">{{ a.text }}</p>
      <!-- A decided appeal: who decided, and the statement. -->
      <p v-if="a.status !== 'open'">Decided {{ when(a.decidedAt) }} by {{ a.decidedBy }}: {{ a.statement }}</p>
      <!-- Deciding an open appeal. -->
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
/* The section, each appeal and each decision form are columns with the shared gap. */
.appeals,
.appeal,
.decide {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The cards are spaced and keep a readable width. */
.appeals {
  gap: var(--space-md);
  max-inline-size: var(--mw-content-prose);
}

/* A bordered card whose text may wrap anywhere. */
.appeal {
  padding: var(--space-sm);
  overflow-wrap: anywhere;
  border: 1px solid var(--border);
  border-radius: var(--radius);
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

/* The appeal keeps its line breaks. */
.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
