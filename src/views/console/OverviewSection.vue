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
h3 {
  margin: 0;
}
</style>
