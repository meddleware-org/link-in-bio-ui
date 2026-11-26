<script setup lang="ts">
// The app area (`/`): what the instance offers, then either signing in and up, or the signed-in account's page, billing and account.
// `/billing?checkout=<id>` (where a payment provider's page sends the person back) opens billing and follows that checkout.
// Vue's reactivity, lifecycle and lazy components.
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
// The shared tabs, button, live status, notice and tab panel.
import { AppTabNav, UiButton, UiLiveStatus, UiNotice, UiTabPanel, type AppTab } from '@meddleware/ui'
// Accepts only addresses that are safe to link.
import { safeHref } from '@meddleware/web-utils'
// Apply the instance's network and full node to the wallet adapter.
import { applyInstanceNetwork } from '../../lib/network.js'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// The HTTP layer.
import type { Http } from '../../api/http.js'
// An account as the service reports it.
import type { Account } from '../../api/types.js'
// The one-time recovery codes.
import RecoveryCodes from '../../components/RecoveryCodes.vue'
// The app context every view below reads.
import { createAppContext, provideApp } from '../../context.js'
// The app's own router.
import type { Router } from '../../route.js'
// Sign in.
import SignInView from './SignInView.vue'
// Create an account.
import SignUpView from './SignUpView.vue'

// The HTTP layer and the router.
const props = defineProps<{ http: Http; router: Router }>()
// Tell the shell the product name once the instance answers.
const emit = defineEmits<{ product: [name: string] }>()

// The signed-in views load when first opened.
const PageView = defineAsyncComponent(() => import('./PageView.vue'))
const BillingView = defineAsyncComponent(() => import('./BillingView.vue'))
const AccountView = defineAsyncComponent(() => import('./AccountView.vue'))

// The shared context: the typed API, what the instance offers, who is signed in and the router.
const app = createAppContext(props.http, props.router)
// Every view below reads it with `useApp()`.
provideApp(app)

// True until the instance and the session are known.
const loading = ref(true)
// A failed load or a session that did not start, in words.
const problem = ref('')
// Recovery codes to show once, straight after sign-up.
const codes = ref<string[] | null>(null)
// A warning when few recovery codes remain.
const leftNotice = ref('')

// The tabs when nobody is signed in.
const OUT_TABS: AppTab[] = [
  { id: 'signin', label: 'Sign in' },
  { id: 'signup', label: 'Create an account' },
]
// The tabs when someone is.
const IN_TABS: AppTab[] = [
  { id: 'page', label: 'Your page' },
  { id: 'billing', label: 'Billing' },
  { id: 'account', label: 'Account' },
]
// The signed-out tab.
const outTab = ref('signin')
// The signed-in tab: billing when the person came back from a payment page, else the page.
const inTab = ref(props.router.path.value.replace(/\/+$/, '') === '/billing' ? 'billing' : 'page')
// The checkout a payment provider's page sent the person back from, if any.
const returning = computed(() => props.router.query.value.get('checkout'))
// The values an Open Payments wallet added to the return address, if the person came back from one.
const openPaymentsReturn = computed(() => {
  const q = props.router.query.value
  return q.get('openPayments') === 'finish' ? { hash: q.get('hash'), interactRef: q.get('interact_ref') } : null
})

// Ask what the instance offers and who is signed in.
onMounted(async () => {
  try {
    const instance = await app.api.instance()
    app.instance.value = instance
    emit('product', instance.product)
    // Put the wallet on the instance's network and full node, before anything signs.
    applyInstanceNetwork(instance)
    // Who is signed in (null when nobody is).
    await app.refreshMe()
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    loading.value = false
  }
})

/** After a sign-in or sign-up: keep any recovery codes to show, warn when few remain, and ask who is signed in. */
async function signedIn(account: Account, extra: { recoveryCodes?: string[]; recoveryCodesLeft?: number } = {}): Promise<void> {
  if (extra.recoveryCodes) codes.value = extra.recoveryCodes
  if (extra.recoveryCodesLeft !== undefined && extra.recoveryCodesLeft <= 3) {
    leftNotice.value = `You have ${extra.recoveryCodesLeft} recovery code${extra.recoveryCodesLeft === 1 ? '' : 's'} left. Replace them under Account.`
  }
  try {
    await app.refreshMe()
  } catch (e) {
    problem.value = describeError(e)
  }
  // A sign-in that did not produce a session usually means the browser blocks cookies for the site.
  if (!app.me.value) problem.value = `Signed in as ${account.handle}, but the session did not start. Check that this browser allows cookies for this site.`
}

/** Sign out; the session is ended on this side whatever the service answers. */
async function signOut(): Promise<void> {
  try {
    await app.api.logout()
  } catch {
    /* the session is ended on this side either way */
  }
  app.me.value = null
  outTab.value = 'signin'
}

// A deleted account, or a session that ended, lands back on sign-in.
// A deleted account, or a session that ended, lands back on sign-in.
watch(app.me, (m) => {
  if (!m) inTab.value = 'page'
})
// The account's page address, only when it is safe to link.
const pageLink = computed(() => safeHref(app.me.value?.pageUrl))
</script>

<template>
  <div class="app-area">
    <!-- Announces loading. -->
    <UiLiveStatus label="Loading" :message="loading ? 'Loading…' : ''" />
    <!-- A failed load, in words. -->
    <UiNotice v-if="problem" type="error" :message="problem" />

    <!-- Shown once, until the person confirms they saved them. -->
    <RecoveryCodes v-if="codes" :codes="codes" @done="codes = null" />

    <!-- Signed in. -->
    <template v-else-if="!loading && app.me.value">
      <!-- Who is signed in, a link to the page, and sign out. -->
      <div class="who">
        <p class="who-line">
          Signed in as <strong>{{ app.me.value.handle }}</strong>
          <template v-if="pageLink"> · <a :href="pageLink">{{ app.me.value.pageUrl }}</a></template>
        </p>
        <UiButton variant="ghost" size="sm" @click="signOut">Sign out</UiButton>
      </div>
      <!-- Few recovery codes remain. -->
      <UiNotice v-if="leftNotice" type="warning" :message="leftNotice" />
      <!-- Page, billing and account. -->
      <AppTabNav v-model="inTab" :tabs="IN_TABS" id-prefix="lib-app" aria-label="Your account" />
      <!-- The open view. -->
      <UiTabPanel id-prefix="lib-app" :tab="inTab" class="app-panel">
        <PageView v-if="inTab === 'page'" @navigate="inTab = $event" />
        <BillingView v-else-if="inTab === 'billing'" :returning="returning" :open-payments-return="openPaymentsReturn" />
        <AccountView v-else @signed-out="app.me.value = null" />
      </UiTabPanel>
    </template>

    <!-- Signed out: sign in or create an account. -->
    <div v-else-if="!loading && app.instance.value" class="signed-out">
      <!-- The two ways in. -->
      <AppTabNav v-model="outTab" :tabs="OUT_TABS" id-prefix="lib-start" aria-label="Sign in or create an account" />
      <UiTabPanel id-prefix="lib-start" :tab="outTab" class="app-panel">
        <SignInView v-if="outTab === 'signin'" @signed-in="signedIn" />
        <SignUpView v-else @signed-in="signedIn" />
      </UiTabPanel>
    </div>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.app-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-md);
}

/* The identity row wraps. */
.who {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  align-items: center;
  justify-content: space-between;
}

/* Long handles and addresses may wrap anywhere. */
.who-line {
  margin: 0;
  overflow-wrap: anywhere;
}

/* Space above and below the open view. */
.app-panel {
  padding-block: var(--space-sm);
}

/* The signed-out views are narrow and centred. */
.signed-out {
  inline-size: 100%;
  max-inline-size: var(--mw-tool-content-max);
  margin-inline: auto;
}
</style>
