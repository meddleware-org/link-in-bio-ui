<script setup lang="ts">
// The operator console (`/admin/`). The access gate in front of the admin host signs the operator in: there is no sign-in here. A 401
// or 403 (a redirect, or the gate's own sign-in page where JSON belongs, reads as 401) means the operator must sign in through the gate.
// A 503 is the service saying the console cannot be used now: either the deployment has not configured its gate, or something the gate
// needs (the identity keys, the role service, the database) is down; the service's own words say which. Any other failure, including an
// error page from the edge (a 502 that is HTML), is shown as the error it is, not as a sign-in.
import { computed, defineAsyncComponent, onMounted, ref, type Component } from 'vue'
import { AppTabNav, UiButton, UiLiveStatus, UiNotice, UiTabPanel, type AppTab } from '@meddleware/ui'
import { adminApi } from '../../api/admin.js'
import { ApiError, describeError } from '../../api/errors.js'
import type { Http } from '../../api/http.js'
import type { Operator } from '../../api/types.js'
import { provideConsole } from './console.js'

const props = defineProps<{ http: Http }>()
const AccountsSection = defineAsyncComponent(() => import('./AccountsSection.vue'))
const api = adminApi(props.http)

const SECTIONS: Array<AppTab & { view: Component }> = [
  { id: 'overview', label: 'Overview', view: defineAsyncComponent(() => import('./OverviewSection.vue')) },
  { id: 'accounts', label: 'Accounts', view: AccountsSection },
  { id: 'invites', label: 'Invites', view: defineAsyncComponent(() => import('./InvitesSection.vue')) },
  { id: 'selections', label: 'Selections', view: defineAsyncComponent(() => import('./SelectionsSection.vue')) },
  { id: 'reports', label: 'Reports', view: defineAsyncComponent(() => import('./ReportsSection.vue')) },
  { id: 'appeals', label: 'Appeals', view: defineAsyncComponent(() => import('./AppealsSection.vue')) },
  { id: 'refunds', label: 'Refunds', view: defineAsyncComponent(() => import('./RefundsSection.vue')) },
  { id: 'blocklist', label: 'Blocklist', view: defineAsyncComponent(() => import('./BlocklistSection.vue')) },
  { id: 'links', label: 'Links', view: defineAsyncComponent(() => import('./LinksSection.vue')) },
  { id: 'audit', label: 'Audit log', view: defineAsyncComponent(() => import('./AuditSection.vue')) },
]
const TABS: AppTab[] = SECTIONS.map(({ id, label }) => ({ id, label }))
const tab = ref('overview')
const accountId = ref<string | null>(null)
const view = computed(() => SECTIONS.find((s) => s.id === tab.value)!.view)

provideConsole({
  api,
  openAccount(id) {
    accountId.value = id
    tab.value = 'accounts'
  },
})

const operator = ref<Operator | null>(null)
const gate = ref<'loading' | 'ok' | 'signin' | 'unavailable' | 'error'>('loading')
const problem = ref('')

onMounted(async () => {
  try {
    operator.value = await api.me()
    gate.value = 'ok'
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) gate.value = 'signin'
    else if (e instanceof ApiError && e.status === 503) {
      gate.value = 'unavailable'
      problem.value = e.message
    } else {
      gate.value = 'error'
      problem.value = describeError(e)
    }
  }
})

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div class="console">
    <UiLiveStatus label="Console" :message="gate === 'loading' ? 'Checking who you are…' : ''" />
    <template v-if="gate === 'signin'">
      <h2>Sign in through your access gate</h2>
      <p>This console is behind the deployment’s access gate. Sign in there, then reload this page.</p>
      <p><UiButton @click="reload">Reload</UiButton></p>
    </template>
    <template v-else-if="gate === 'unavailable'">
      <h2>The console is not available</h2>
      <p>
        Either this deployment has not set up the console’s access gate, or a service the gate needs is down. Nothing was changed. Try
        again in a moment.
      </p>
      <p v-if="problem">The service says: {{ problem }}.</p>
      <p><UiButton @click="reload">Reload</UiButton></p>
    </template>
    <UiNotice v-else-if="gate === 'error'" type="error" :message="problem" />
    <template v-else-if="gate === 'ok'">
      <p class="who">Signed in as <strong>{{ operator?.name || operator?.subject }}</strong></p>
      <AppTabNav v-model="tab" :tabs="TABS" id-prefix="lib-console" variant="raised" aria-label="Console sections" />
      <UiTabPanel id-prefix="lib-console" :tab="tab" class="console-panel">
        <AccountsSection v-if="tab === 'accounts'" v-model:account="accountId" />
        <component :is="view" v-else :key="tab" />
      </UiTabPanel>
    </template>
  </div>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-sm);
}

.console h2,
.console p {
  margin: 0;
}

.console-panel {
  padding-block: var(--space-sm);
}
</style>
