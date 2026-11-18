<script setup lang="ts">
// The app area (`/`): what the instance offers, then either signing in and up, or the signed-in account's page, billing and account.
// `/billing?checkout=<id>` (where a payment provider's page sends the person back) opens billing and follows that checkout.
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { AppTabNav, UiButton, UiLiveStatus, UiNotice, UiTabPanel, type AppTab } from '@meddleware/ui'
import { safeHref } from '@meddleware/web-utils'
import { useNetwork, type MwNetwork } from '@meddleware/wallet-adapter'
import { describeError } from '../../api/errors.js'
import type { Http } from '../../api/http.js'
import type { Account } from '../../api/types.js'
import RecoveryCodes from '../../components/RecoveryCodes.vue'
import { createAppContext, provideApp } from '../../context.js'
import type { Router } from '../../route.js'
import SignInView from './SignInView.vue'
import SignUpView from './SignUpView.vue'

const props = defineProps<{ http: Http; router: Router }>()
const emit = defineEmits<{ product: [name: string] }>()

const PageView = defineAsyncComponent(() => import('./PageView.vue'))
const BillingView = defineAsyncComponent(() => import('./BillingView.vue'))
const AccountView = defineAsyncComponent(() => import('./AccountView.vue'))

const app = createAppContext(props.http, props.router)
provideApp(app)

const loading = ref(true)
const problem = ref('')
const codes = ref<string[] | null>(null)
const leftNotice = ref('')

const OUT_TABS: AppTab[] = [
  { id: 'signin', label: 'Sign in' },
  { id: 'signup', label: 'Create an account' },
]
const IN_TABS: AppTab[] = [
  { id: 'page', label: 'Your page' },
  { id: 'billing', label: 'Billing' },
  { id: 'account', label: 'Account' },
]
const outTab = ref('signin')
const inTab = ref(props.router.path.value.replace(/\/+$/, '') === '/billing' ? 'billing' : 'page')
const returning = computed(() => props.router.query.value.get('checkout'))
const openPaymentsReturn = computed(() => {
  const q = props.router.query.value
  return q.get('openPayments') === 'finish' ? { hash: q.get('hash'), interactRef: q.get('interact_ref') } : null
})

onMounted(async () => {
  try {
    const instance = await app.api.instance()
    app.instance.value = instance
    emit('product', instance.product)
    if (['testnet', 'mainnet', 'localnet'].includes(instance.suiNetwork)) useNetwork().setNetwork(instance.suiNetwork as MwNetwork)
    await app.refreshMe()
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    loading.value = false
  }
})

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
  if (!app.me.value) problem.value = `Signed in as ${account.handle}, but the session did not start. Check that this browser allows cookies for this site.`
}

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
watch(app.me, (m) => {
  if (!m) inTab.value = 'page'
})
const pageLink = computed(() => safeHref(app.me.value?.pageUrl))
</script>

<template>
  <div class="app-area">
    <UiLiveStatus label="Loading" :message="loading ? 'Loading…' : ''" />
    <UiNotice v-if="problem" type="error" :message="problem" />

    <RecoveryCodes v-if="codes" :codes="codes" @done="codes = null" />

    <template v-else-if="!loading && app.me.value">
      <div class="who">
        <p class="who-line">
          Signed in as <strong>{{ app.me.value.handle }}</strong>
          <template v-if="pageLink"> · <a :href="pageLink">{{ app.me.value.pageUrl }}</a></template>
        </p>
        <UiButton variant="ghost" size="sm" @click="signOut">Sign out</UiButton>
      </div>
      <UiNotice v-if="leftNotice" type="warning" :message="leftNotice" />
      <AppTabNav v-model="inTab" :tabs="IN_TABS" id-prefix="lib-app" aria-label="Your account" />
      <UiTabPanel id-prefix="lib-app" :tab="inTab" class="app-panel">
        <PageView v-if="inTab === 'page'" @navigate="inTab = $event" />
        <BillingView v-else-if="inTab === 'billing'" :returning="returning" :open-payments-return="openPaymentsReturn" />
        <AccountView v-else @signed-out="app.me.value = null" />
      </UiTabPanel>
    </template>

    <div v-else-if="!loading && app.instance.value" class="signed-out">
      <AppTabNav v-model="outTab" :tabs="OUT_TABS" id-prefix="lib-start" aria-label="Sign in or create an account" />
      <UiTabPanel id-prefix="lib-start" :tab="outTab" class="app-panel">
        <SignInView v-if="outTab === 'signin'" @signed-in="signedIn" />
        <SignUpView v-else @signed-in="signedIn" />
      </UiTabPanel>
    </div>
  </div>
</template>

<style scoped>
.app-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-md);
}

.who {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  align-items: center;
  justify-content: space-between;
}

.who-line {
  margin: 0;
  overflow-wrap: anywhere;
}

.app-panel {
  padding-block: var(--space-sm);
}

.signed-out {
  inline-size: 100%;
  max-inline-size: var(--mw-tool-content-max);
  margin-inline: auto;
}
</style>
