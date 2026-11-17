<script setup lang="ts">
// The reports queue. Each report is decided by a person: actioned or dismissed, with a short decision, the statement of reasons the
// page's owner sees (and may appeal), and, for a report about one link, hiding that link on every page.
import { onMounted, ref, watch } from 'vue'
import { UiBadge, UiButton, UiCheckField, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { ReportRow } from '../../api/types.js'
import { when } from '../../lib/format.js'
import { reasonLabel } from '../../lib/reasons.js'
import { useConsole } from './console.js'

const { api, openAccount } = useConsole()
const filter = ref('open')
const reports = ref<ReportRow[]>([])
const loaded = ref(false)
const forms = ref<Record<string, { status: 'actioned' | 'dismissed'; decision: string; statement: string; hideLink: boolean }>>({})
const status = ref('')
const problem = ref<{ id: string; text: string } | null>(null)
const busy = ref('')

async function load(): Promise<void> {
  try {
    reports.value = (await api.reports(filter.value)).reports
    for (const r of reports.value) forms.value[r.id] ??= { status: 'actioned', decision: '', statement: '', hideLink: false }
  } catch (e) {
    problem.value = { id: '', text: describeError(e) }
  } finally {
    loaded.value = true
  }
}
onMounted(load)
watch(filter, load)

async function decide(r: ReportRow): Promise<void> {
  const f = forms.value[r.id]!
  if (busy.value) return
  busy.value = r.id
  problem.value = null
  try {
    await api.decideReport(r.id, { status: f.status, decision: f.decision.trim(), statement: f.statement.trim() || undefined, hideLink: f.hideLink && !!r.url })
    status.value = `The report about ${r.page} is ${f.status}.`
    await load()
  } catch (e) {
    problem.value = { id: r.id, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
]
const OUTCOMES = [
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
]
</script>

<template>
  <div class="reports">
    <h2>Reports</h2>
    <UiSegmentedControl layout="wrap" v-model="filter" :options="FILTERS" label="Show reports that are" :label-hidden="false" />
    <UiNotice v-if="problem && !problem.id" type="error" :message="problem.text" />
    <UiLiveStatus label="Reports" :message="status" />
    <p v-if="loaded && !reports.length">No {{ filter }} reports.</p>

    <article v-for="r in reports" :key="r.id" class="report" :aria-labelledby="`rep-${r.id}`">
      <h3 :id="`rep-${r.id}`">{{ reasonLabel(r.reason) }}: {{ r.page }}</h3>
      <p class="meta">
        <UiBadge :tone="r.status === 'open' ? 'warn' : 'neutral'">{{ r.status }}</UiBadge>
        reported {{ when(r.createdAt) }}
        <template v-if="r.account">
          · <UiButton variant="link" @click="openAccount(r.account)">open the account<span class="mw-visually-hidden"> {{ r.page }}</span></UiButton>
        </template>
      </p>
      <p v-if="r.url">Link: <code class="url">{{ r.url }}</code></p>
      <p v-if="r.details" class="details">{{ r.details }}</p>
      <p v-if="r.contact">Reporter’s contact: {{ r.contact }}</p>
      <template v-if="r.status !== 'open'">
        <p>Decided {{ when(r.decidedAt) }} by {{ r.decidedBy }}: {{ r.decision }}</p>
        <p v-if="r.statement" class="details">{{ r.statement }}</p>
      </template>
      <form v-else-if="forms[r.id]" class="decide" @submit.prevent="decide(r)">
        <h4>Decide</h4>
        <UiSegmentedControl layout="wrap" v-model="forms[r.id]!.status" :options="OUTCOMES" :label="`Outcome for the report about ${r.page}`" />
        <UiTextField :id="`rep-dec-${r.id}`" v-model="forms[r.id]!.decision" label="Decision (short)" :maxlength="200" required />
        <UiTextField :id="`rep-st-${r.id}`" v-model="forms[r.id]!.statement" label="Statement of reasons (the owner sees this)" :rows="3" :maxlength="4000" />
        <UiCheckField v-if="r.url" v-model="forms[r.id]!.hideLink" label="Hide this link on every page" />
        <p><UiButton type="submit" :busy="busy === r.id" :disabled="!forms[r.id]!.decision.trim()">Record the decision</UiButton></p>
        <UiNotice v-if="problem?.id === r.id" type="error" :message="problem.text" />
      </form>
    </article>
  </div>
</template>

<style scoped>
.reports,
.report,
.decide {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.reports {
  gap: var(--space-md);
  max-inline-size: var(--mw-content-prose);
}

.report {
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

.url,
.details {
  overflow-wrap: anywhere;
}

.details {
  white-space: pre-wrap;
}
</style>
