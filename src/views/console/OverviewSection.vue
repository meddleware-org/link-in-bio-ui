<script setup lang="ts">
// Counts, queues and the deployment's switches.
import { onMounted, ref, shallowRef } from 'vue'
import { UiBadge, UiLiveStatus, UiNotice, UiStatGrid, UiStatRow } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { Overview } from '../../api/types.js'
import { bytes, when } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api } = useConsole()
const o = shallowRef<Overview | null>(null)
const problem = ref('')
onMounted(async () => {
  try {
    o.value = await api.overview()
  } catch (e) {
    problem.value = describeError(e)
  }
})
const SIGNUP: Record<string, string> = { closed: 'Closed', invite: 'By invitation', open: 'Open' }
const budget = (n: number, per: string) => (n ? `${n.toLocaleString('en-GB')} ${per}` : 'no limit')
const count = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-GB')
</script>

<template>
  <div class="overview">
    <h2>Overview</h2>
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus v-else-if="!o" label="Loading" message="Loading…" />
    <template v-if="o">
      <section aria-labelledby="ov-work">
        <h3 id="ov-work">Waiting for a person</h3>
        <UiStatGrid>
          <UiStatRow label="Open reports">{{ o.reports.open }}<template v-if="o.reports.openOver24h"> ({{ o.reports.openOver24h }} older than a day)</template></UiStatRow>
          <UiStatRow label="Open appeals">{{ o.appealsOpen }}</UiStatRow>
          <UiStatRow label="Links flagged">{{ o.links.flagged }}</UiStatRow>
          <UiStatRow label="Links that could not be checked">{{ o.links.unknown }}</UiStatRow>
        </UiStatGrid>
      </section>
      <section aria-labelledby="ov-accounts">
        <h3 id="ov-accounts">Accounts and pages</h3>
        <UiStatGrid>
          <UiStatRow label="Active accounts">{{ o.accounts.active }}</UiStatRow>
          <UiStatRow label="Suspended">{{ o.accounts.suspended }}</UiStatRow>
          <UiStatRow label="Free">{{ o.accounts.free }}</UiStatRow>
          <UiStatRow label="Paid">{{ o.accounts.paid }}</UiStatRow>
          <UiStatRow label="Pages published">{{ o.pagesPublished }}</UiStatRow>
          <UiStatRow label="Open checkouts">{{ o.checkoutsOpen }}</UiStatRow>
          <UiStatRow label="Pictures stored">{{ bytes(o.storageBytes) }}</UiStatRow>
        </UiStatGrid>
      </section>
      <section aria-labelledby="ov-switches">
        <h3 id="ov-switches">Switches</h3>
        <UiStatGrid>
          <UiStatRow label="Sign-up">{{ SIGNUP[o.switches.signup] ?? o.switches.signup }}</UiStatRow>
          <UiStatRow label="Other people’s pages served">
            <UiBadge :tone="o.switches.thirdPartyPages ? 'ok' : 'neutral'">{{ o.switches.thirdPartyPages ? 'On' : 'Off' }}</UiBadge>
          </UiStatRow>
          <UiStatRow label="Payment providers">{{ o.switches.billingProviders.join(', ') || 'none' }}</UiStatRow>
          <UiStatRow label="Custom domains allowed">{{ o.switches.customHostnameCap || 'off' }}</UiStatRow>
          <UiStatRow label="Web Risk screening">
            <UiBadge :tone="o.switches.webRisk ? 'ok' : 'neutral'">{{ o.switches.webRisk ? 'On' : 'Off' }}</UiBadge>
          </UiStatRow>
          <UiStatRow label="Federation">
            <UiBadge :tone="o.switches.federation ? 'ok' : 'neutral'">{{ o.switches.federation ? 'On' : 'Off' }}</UiBadge>
          </UiStatRow>
          <UiStatRow label="Bank feeds">{{ o.switches.bankFeeds?.join(', ') || 'none' }}</UiStatRow>
        </UiStatGrid>
      </section>
      <section v-if="o.accountLimits" aria-labelledby="ov-limits">
        <h3 id="ov-limits">Change budgets per account</h3>
        <p>Removing or hiding links, and taking a page offline, are never limited.</p>
        <UiStatGrid>
          <UiStatRow label="Preset">{{ o.accountLimits.preset === 'generous' ? 'Generous' : 'Standard' }}</UiStatRow>
          <UiStatRow label="Changes (publishes and picture uploads)">{{ budget(o.accountLimits.changesPerHour, 'an hour') }}</UiStatRow>
          <UiStatRow label="New links">{{ budget(o.accountLimits.newLinksPerDay, 'a day') }}</UiStatRow>
        </UiStatGrid>
      </section>
      <section v-if="o.webRisk" aria-labelledby="ov-webrisk">
        <h3 id="ov-webrisk">Web Risk this month ({{ o.webRisk.month }})</h3>
        <p v-if="!o.webRisk.on">Off: links are checked against the built-in rules, the blocklist and ThreatFox only.</p>
        <UiStatGrid v-else-if="o.webRisk.mode === 'lookup'">
          <UiStatRow label="Mode">Lookup (each new link is checked with Google)</UiStatRow>
          <UiStatRow label="Calls">{{ count(o.webRisk.calls) }} of {{ count(o.webRisk.allowance ?? o.webRisk.monthlyCap) }}</UiStatRow>
          <UiStatRow label="Free allowance">{{ count(o.webRisk.monthlyCap) }}</UiStatRow>
          <UiStatRow label="Paid calls allowed">{{ count(o.webRisk.paidMonthlyCalls) }}</UiStatRow>
          <UiStatRow v-if="o.webRisk.rechecksStopAt != null" label="Rechecks stop at">{{ count(o.webRisk.rechecksStopAt) }} (the rest is kept for new links)</UiStatRow>
        </UiStatGrid>
        <template v-else>
          <UiStatGrid>
            <UiStatRow label="Mode">Update (the lists are kept here; no link leaves the service)</UiStatRow>
            <UiStatRow label="Calls">{{ count(o.webRisk.calls) }} of {{ count(o.webRisk.monthlyCap) }}</UiStatRow>
            <UiStatRow label="Confirmations">{{ count(o.webRisk.confirms) }} of {{ count(o.webRisk.confirmMonthlyCap) }}</UiStatRow>
          </UiStatGrid>
          <UiStatGrid v-if="o.webRisk.lists?.length">
            <UiStatRow v-for="l in o.webRisk.lists" :key="l.threatType" :label="l.threatType">
              <UiBadge :tone="l.lastError ? 'danger' : 'ok'">{{ l.lastError ? 'Failing' : 'Current' }}</UiBadge>
              {{ count(l.entries) }} entries, updated {{ when(l.updatedAt) }}<template v-if="l.lastError">: {{ l.lastError }}</template>
            </UiStatRow>
          </UiStatGrid>
        </template>
      </section>
      <section v-if="o.bankFeeds?.length" aria-labelledby="ov-feeds">
        <h3 id="ov-feeds">Bank feeds</h3>
        <UiStatGrid>
          <UiStatRow v-for="f in o.bankFeeds" :key="f.feed" :label="f.feed">
            <UiBadge :tone="f.lastError ? 'danger' : 'ok'">{{ f.lastError ? 'Failing' : 'Working' }}</UiBadge>
            last read {{ f.polledAt ? when(f.polledAt) : 'never' }}, {{ f.creditsSeen }} credits seen<template v-if="f.lastError">: {{ f.lastError }}</template>
          </UiStatRow>
        </UiStatGrid>
      </section>
    </template>
  </div>
</template>

<style scoped>
.overview,
.overview section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.overview {
  gap: var(--space-lg);
  max-inline-size: var(--mw-content-prose);
}

h2,
h3,
p {
  margin: 0;
}
</style>
