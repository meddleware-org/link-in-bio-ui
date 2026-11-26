<script setup lang="ts">
// or 403 (a redirect, or the gate's own sign-in page where JSON belongs, reads as 401) means the operator must sign in through the gate.
// A 503 is the service saying the console cannot be used now: either the deployment has not configured its gate, or something the gate
// needs (the identity keys, the role service, the database) is down; the service's own words say which. Any other failure, including an
// error page from the edge (a 502 that is HTML), is shown as the error it is, not as a sign-in.
// Vue's reactivity, lifecycle and lazy components.
import { computed, defineAsyncComponent, onMounted, ref, type Component } from 'vue'
// The shared tabs, button, live status, notice and tab panel.
import { AppTabNav, UiButton, UiLiveStatus, UiNotice, UiTabPanel, type AppTab } from '@meddleware/ui'
// The typed operator API.
import { adminApi } from '../../api/admin.js'
// The API error (to tell the cases apart) and the words for a failure.
import { ApiError, describeError } from '../../api/errors.js'
// The HTTP layer.
import type { Http } from '../../api/http.js'
// Who the operator is.
import type { Operator } from '../../api/types.js'
// Provide the context to the sections.
import { provideConsole } from './console.js'

// The HTTP layer.
const props = defineProps<{ http: Http }>()
// The accounts section is also used directly, so it is made once.
const AccountsSection = defineAsyncComponent(() => import('./AccountsSection.vue'))
// The typed operator API.
const api = adminApi(props.http)

// The sections in tab order, each loaded when first opened.
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
// The tab list, without the views.
const TABS: AppTab[] = SECTIONS.map(({ id, label }) => ({ id, label }))
// The open tab.
const tab = ref('overview')
// The account the accounts section should show, when another section asked to open one.
const accountId = ref<string | null>(null)
// The open section's view.
const view = computed(() => SECTIONS.find((s) => s.id === tab.value)!.view)

// Share the API and a way to open an account with every section.
provideConsole({
  api,
  openAccount(id) {
    accountId.value = id
    tab.value = 'accounts'
  },
})

// Who the operator is, once known.
const operator = ref<Operator | null>(null)
// Where the access gate check stands.
const gate = ref<'loading' | 'ok' | 'signin' | 'unavailable' | 'error'>('loading')
// The service's own words (503) or a failure.
const problem = ref('')

// Ask who the operator is: that is the check that the access gate let them in.
onMounted(async () => {
  try {
    operator.value = await api.me()
    gate.value = 'ok'
  } catch (e) {
    // Not signed in through the gate.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) gate.value = 'signin'
    // The console cannot be used now; the service's words say why.
    else if (e instanceof ApiError && e.status === 503) {
      gate.value = 'unavailable'
      problem.value = e.message
    } else {
      // Any other failure, shown as the error it is.
      gate.value = 'error'
      problem.value = describeError(e)
    }
  }
})

/** Reload the page, which sends the browser through the access gate again. */
function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div class="console">
    <!-- Announces the check. -->
    <UiLiveStatus label="Console" :message="gate === 'loading' ? 'Checking who you are…' : ''" />
    <!-- Not signed in: tell the operator to sign in through the gate. -->
    <template v-if="gate === 'signin'">
      <h2>Sign in through your access gate</h2>
      <p>This console is behind the deployment’s access gate. Sign in there, then reload this page.</p>
      <p><UiButton @click="reload">Reload</UiButton></p>
    </template>
    <!-- The console cannot be used now. -->
    <template v-else-if="gate === 'unavailable'">
      <h2>The console is not available</h2>
      <p>
        Either this deployment has not set up the console’s access gate, or a service the gate needs is down. Nothing was changed. Try
        again in a moment.
      </p>
      <p v-if="problem">The service says: {{ problem }}.</p>
      <p><UiButton @click="reload">Reload</UiButton></p>
    </template>
    <!-- Any other failure. -->
    <UiNotice v-else-if="gate === 'error'" type="error" :message="problem" />
    <!-- Signed in: the sections. -->
    <template v-else-if="gate === 'ok'">
      <p class="who">Signed in as <strong>{{ operator?.name || operator?.subject }}</strong></p>
      <!-- The sections. -->
      <AppTabNav v-model="tab" :tabs="TABS" id-prefix="lib-console" variant="raised" aria-label="Console sections" />
      <UiTabPanel id-prefix="lib-console" :tab="tab" class="console-panel">
        <!-- The accounts section, which can be told to open one account. -->
        <AccountsSection v-if="tab === 'accounts'" v-model:account="accountId" />
        <!-- Any other section. -->
        <component :is="view" v-else :key="tab" />
      </UiTabPanel>
    </template>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.console {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-sm);
}

/* No default margins. */
.console h2,
.console p {
  margin: 0;
}

/* Space above and below the open section. */
.console-panel {
  padding-block: var(--space-sm);
}
</style>
