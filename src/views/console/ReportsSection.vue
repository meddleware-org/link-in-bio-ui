<script setup lang="ts">
// The reports queue. Each report is decided by a person: actioned or dismissed, with a short decision, the statement of reasons the
// page's owner sees (and may appeal), and, for a report about one link, hiding that link on every page.
// Vue's lifecycle and reactivity.
import { onMounted, ref, watch } from 'vue'
// The shared badge, button, checkbox, live status, notice, segmented control and text field.
import { UiBadge, UiButton, UiCheckField, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// One report.
import type { ReportRow } from '../../api/types.js'
// A date and time for people.
import { when } from '../../lib/format.js'
// The plain words for a reason id.
import { reasonLabel } from '../../lib/reasons.js'
// The console context: the API and a way to open an account.
import { useConsole } from './console.js'

// The typed operator API, and a way to open an account in the accounts section.
const { api, openAccount } = useConsole()
// Which reports to show.
const filter = ref('open')
// The reports.
const reports = ref<ReportRow[]>([])
// True once a read has finished.
const loaded = ref(false)
// One decision form per report.
const forms = ref<Record<string, { status: 'actioned' | 'dismissed'; decision: string; statement: string; hideLink: boolean }>>({})
// A polite announcement of what was done.
const status = ref('')
// A failure, and which report it belongs to.
const problem = ref<{ id: string; text: string } | null>(null)
// Which report is being decided.
const busy = ref('')

/** Read the reports for the filter and make a form for each new one. */
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
// Read again when the filter changes.
watch(filter, load)

/** Record the decision for one report. */
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

// The three filters.
const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
]
// The two outcomes.
const OUTCOMES = [
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
]
</script>

<template>
  <div class="reports">
    <!-- The section's heading. -->
    <h2>Reports</h2>
    <!-- Which reports to show. -->
    <UiSegmentedControl layout="wrap" v-model="filter" :options="FILTERS" label="Show reports that are" :label-hidden="false" />
    <UiNotice v-if="problem && !problem.id" type="error" :message="problem.text" />
    <UiLiveStatus label="Reports" :message="status" />
    <!-- None to show. -->
    <p v-if="loaded && !reports.length">No {{ filter }} reports.</p>

    <!-- One card per report. -->
    <article v-for="r in reports" :key="r.id" class="report" :aria-labelledby="`rep-${r.id}`">
      <h3 :id="`rep-${r.id}`">{{ reasonLabel(r.reason) }}: {{ r.page }}</h3>
      <!-- Status, when it was reported and a link to the account. -->
      <p class="meta">
        <UiBadge :tone="r.status === 'open' ? 'warn' : 'neutral'">{{ r.status }}</UiBadge>
        reported {{ when(r.createdAt) }}
        <template v-if="r.account">
          · <UiButton variant="link" @click="openAccount(r.account)">open the account<span class="mw-visually-hidden"> {{ r.page }}</span></UiButton>
        </template>
      </p>
      <!-- The link the report is about, if it is about one. -->
      <p v-if="r.url">Link: <code class="url">{{ r.url }}</code></p>
      <!-- What the reporter wrote. -->
      <p v-if="r.details" class="details">{{ r.details }}</p>
      <!-- The reporter's address, if they gave one (shown only to the operator). -->
      <p v-if="r.contact">Reporter’s contact: {{ r.contact }}</p>
      <!-- A decided report: who decided, the decision and the statement. -->
      <template v-if="r.status !== 'open'">
        <p>Decided {{ when(r.decidedAt) }} by {{ r.decidedBy }}: {{ r.decision }}</p>
        <p v-if="r.statement" class="details">{{ r.statement }}</p>
      </template>
      <!-- Deciding an open report. -->
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
/* The section, each report and each decision form are columns with the shared gap. */
.reports,
.report,
.decide {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The cards are spaced and keep a readable width. */
.reports {
  gap: var(--space-md);
  max-inline-size: var(--mw-content-prose);
}

/* A bordered card whose text may wrap anywhere. */
.report {
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

/* Long addresses and details may break anywhere. */
.url,
/* The reporter's words keep their line breaks. */
.details {
  overflow-wrap: anywhere;
}

.details {
  white-space: pre-wrap;
}
</style>
