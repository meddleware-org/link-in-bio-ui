<script setup lang="ts">
// the statement of reasons the holder sees) and lifting a suspension, giving or taking back months, codes to pass on, who invited it
// and whom it invited, its billing, domains and audit trail.
// Vue's lifecycle and reactivity.
import { onMounted, ref, shallowRef, watch } from 'vue'
// The shared badge, button, checkbox, table, live status, notice, segmented control and text field.
import { UiBadge, UiButton, UiCheckField, UiDataTable, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// The account shapes.
import type { AccountDetail, AccountRow } from '../../api/types.js'
// Dates, money and shortened ids for people.
import { day, money, short, when } from '../../lib/format.js'
// The tag-list parser and the console context.
import { tagsOf, useConsole } from './console.js'

// The id of the open account; another section can set it to open one here.
const account = defineModel<string | null>('account', { default: null })
// The typed operator API.
const { api } = useConsole()

// The handle prefix searched for.
const q = ref('')
// The search results.
const rows = ref<AccountRow[]>([])
// The open account in full.
const detail = shallowRef<AccountDetail | null>(null)
// A polite announcement of what was done.
const status = ref('')
// A failure, and which action it belongs to.
const problem = ref<{ where: string; text: string } | null>(null)
// Which action is in flight.
const busy = ref('')

// The forms of the open account.
// The flags form of the open account.
const flags = ref({ operator: false, free: false, mayShareInvites: false, tags: '' })
// The suspension form: its kind, reason, length, the report it acts on and the statement the holder sees.
const suspendKind = ref<'policy' | 'legal'>('policy')
const suspendReason = ref('')
const suspendDays = ref('')
const suspendReport = ref('')
const suspendStatement = ref('')
// The grant form: months (negative takes back) and the reason.
const grantMonths = ref('1')
const grantReason = ref('')
// How many invite codes to give.
const inviteCount = ref('1')

/** Search accounts by handle prefix. */
async function search(): Promise<void> {
  try {
    rows.value = (await api.accounts(q.value.trim())).accounts
    status.value = `${rows.value.length} account${rows.value.length === 1 ? '' : 's'} found.`
  } catch (e) {
    problem.value = { where: 'search', text: describeError(e) }
  }
}

/** Open one account in full and fill the flags form from it. */
async function open(id: string | null): Promise<void> {
  detail.value = null
  if (!id) return
  try {
    const d = await api.account(id)
    detail.value = d
    flags.value = { operator: d.account.operator, free: d.account.free, mayShareInvites: d.account.mayShareInvites, tags: d.account.tags.join(', ') }
  } catch (e) {
    problem.value = { where: 'open', text: describeError(e) }
  }
}
// Open whichever account the id names, now or later.
watch(account, open)
// Search, then open the account another section asked for, if any.
onMounted(async () => {
  await search()
  if (account.value) await open(account.value)
})

/** Run one action on the open account: one at a time; on success reload the account and the search. */
async function act(where: string, f: () => Promise<string>): Promise<void> {
  if (busy.value || !detail.value) return
  busy.value = where
  problem.value = null
  try {
    status.value = await f()
    await open(detail.value.account.id)
    await search()
  } catch (e) {
    problem.value = { where, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}
// The failure text for an action, or empty.
const failed = (where: string) => (problem.value?.where === where ? problem.value.text : '')
// The open account's id.
const id = () => detail.value!.account.id

// Save the flags; tags are parsed from the comma list.
const saveFlags = () =>
  act('flags', async () => {
    await api.setFlags(id(), { ...flags.value, tags: tagsOf(flags.value.tags) })
    return 'Flags saved.'
  })
// Suspend the account: a kind, a reason for the record, an optional length and the statement of reasons the holder sees.
const suspend = () =>
  act('suspend', async () => {
    const days = Number(suspendDays.value)
    await api.suspend(id(), {
      kind: suspendKind.value,
      reason: suspendReason.value.trim(),
      days: suspendDays.value && days > 0 ? days : undefined,
      report: suspendReport.value.trim() || undefined,
      statement: suspendStatement.value.trim(),
    })
    suspendReason.value = suspendStatement.value = suspendDays.value = suspendReport.value = ''
    return 'Account suspended; its sessions ended.'
  })
// Lift the suspension.
const unsuspend = () =>
  act('unsuspend', async () => {
    await api.unsuspend(id())
    return 'Suspension lifted.'
  })
// Give or take back months, with a reason.
const grant = () =>
  act('grant', async () => {
    const r = await api.grant(id(), { months: Number(grantMonths.value), reason: grantReason.value.trim() })
    grantReason.value = ''
    return `Paid until ${day(r.paidUntil)}.`
  })
// Give the account invite codes to pass on.
const giveCodes = () =>
  act('codes', async () => {
    const r = await api.issue({ count: Number(inviteCount.value), heldBy: id() })
    return `${r.issued} code${r.issued === 1 ? '' : 's'} given to pass on; the account sees them in the app.`
  })

// The two kinds of suspension: policy (the page is gone, 410) and legal (withheld, 451).
const KINDS = [
  { id: 'policy', label: 'Policy (gone, 410)' },
  { id: 'legal', label: 'Legal (withheld, 451)' },
]
// A badge tone per account status.
const statusTone = (s: string) => (s === 'active' ? 'ok' : s === 'suspended' ? 'danger' : 'neutral')
</script>

<template>
  <div class="accounts">
    <!-- The section's heading. -->
    <h2>Accounts</h2>
    <!-- Search by handle prefix. -->
    <form class="inline-form" @submit.prevent="search">
      <UiTextField id="acc-q" v-model="q" label="Handle starts with" type="search" spellcheck="false" />
      <UiButton type="submit" variant="secondary">Search</UiButton>
    </form>
    <!-- A failed search or open. -->
    <UiNotice v-if="failed('search') || failed('open')" type="error" :message="problem?.text ?? ''" />
    <UiLiveStatus label="Accounts" :message="status" />

    <!-- The results. -->
    <UiDataTable caption="Accounts" :rows="rows.length" empty="No accounts match.">
      <template #head>
        <!-- Column headings. -->
        <th scope="col">Handle</th>
        <th scope="col">Status</th>
        <th scope="col">Paid until</th>
        <th scope="col">Flags</th>
        <th scope="col">Action</th>
      </template>
      <!-- One row per account found. -->
      <tr v-for="a in rows" :key="a.id">
        <th scope="row">{{ a.handle }}</th>
        <td><UiBadge :tone="statusTone(a.status)">{{ a.status }}</UiBadge></td>
        <td>{{ a.free ? 'free' : day(a.paidUntil) }}</td>
        <td>{{ [a.operator && 'operator', a.mayShareInvites && 'passes on invites', ...a.tags].filter(Boolean).join(', ') || '—' }}</td>
        <td><UiButton variant="secondary" size="sm" @click="account = a.id">Open<span class="mw-visually-hidden"> ({{ a.handle }})</span></UiButton></td>
      </tr>
    </UiDataTable>

    <!-- The open account. -->
    <article v-if="detail" class="detail" aria-labelledby="acc-detail-title">
      <!-- The open account's handle. -->
      <h3 id="acc-detail-title">{{ detail.account.handle }}</h3>
      <p>
        <UiBadge :tone="statusTone(detail.account.status)">{{ detail.account.status }}</UiBadge>
        <template v-if="detail.account.suspensionKind"> {{ detail.account.suspensionKind }}: {{ detail.account.suspensionReason }}<template v-if="detail.account.suspendedUntil">, until {{ day(detail.account.suspendedUntil) }}</template></template>
        · created {{ day(detail.account.createdAt) }} · {{ detail.account.free ? 'free' : `paid until ${day(detail.account.paidUntil)}` }}
        · page {{ detail.page?.published ? `published (version ${detail.page.version})` : 'not published' }}
        <template v-if="detail.account.country"> · {{ detail.account.country }}</template>
      </p>

      <!-- The account's flags and tags. -->
      <form class="part" @submit.prevent="saveFlags">
        <!-- The flags the operator can set. -->
        <h4>Flags</h4>
        <!-- Whether the account is the operator's own. -->
        <UiCheckField v-model="flags.operator" label="Operator’s own account" />
        <!-- Whether it pays nothing. -->
        <UiCheckField v-model="flags.free" label="Free (no payment needed)" />
        <!-- Whether it may pass invite codes on. -->
        <UiCheckField v-model="flags.mayShareInvites" label="May pass on invite codes" />
        <UiTextField id="acc-tags" v-model="flags.tags" label="Tags" hint="comma-separated" />
        <p><UiButton type="submit" variant="secondary" :busy="busy === 'flags'">Save the flags</UiButton></p>
        <UiNotice v-if="failed('flags')" type="error" :message="failed('flags')" />
      </form>

      <!-- Suspending an active account. -->
      <form v-if="detail.account.status === 'active'" class="part" @submit.prevent="suspend">
        <!-- Suspension needs a kind, a reason for the record and a statement of reasons. -->
        <h4>Suspend</h4>
        <UiSegmentedControl layout="wrap" v-model="suspendKind" :options="KINDS" label="Kind" :label-hidden="false" />
        <!-- The reason, for the record. -->
        <UiTextField id="sus-reason" v-model="suspendReason" label="Reason (for the record)" required />
        <UiTextField id="sus-days" v-model="suspendDays" label="Days (optional; empty until lifted)" type="number" min="1" max="365" />
        <UiTextField id="sus-report" v-model="suspendReport" label="Report it acts on (optional id)" spellcheck="false" />
        <!-- The statement of reasons the holder sees. -->
        <UiTextField id="sus-statement" v-model="suspendStatement" label="Statement of reasons (the holder sees this)" :rows="4" required />
        <p><UiButton type="submit" variant="danger" :busy="busy === 'suspend'" :disabled="!suspendReason.trim() || !suspendStatement.trim()">Suspend the account</UiButton></p>
        <UiNotice v-if="failed('suspend')" type="error" :message="failed('suspend')" />
      </form>
      <!-- Lifting a suspension. -->
      <div v-else-if="detail.account.status === 'suspended'" class="part">
        <h4>Suspended</h4>
        <p><UiButton variant="secondary" :busy="busy === 'unsuspend'" @click="unsuspend">Lift the suspension</UiButton></p>
        <UiNotice v-if="failed('unsuspend')" type="error" :message="failed('unsuspend')" />
      </div>

      <!-- Giving or taking back months. -->
      <form class="part" @submit.prevent="grant">
        <!-- A grant changes the paid period; the reason is recorded. -->
        <h4>Give or take back months</h4>
        <div class="inline-form">
          <!-- Months to give (negative takes back). -->
          <UiTextField id="grant-months" v-model="grantMonths" label="Months (negative takes back)" type="number" min="-24" max="24" />
          <UiTextField id="grant-reason" v-model="grantReason" label="Reason" required />
        </div>
        <p><UiButton type="submit" variant="secondary" :busy="busy === 'grant'" :disabled="!grantReason.trim()">Change the paid period</UiButton></p>
        <UiNotice v-if="failed('grant')" type="error" :message="failed('grant')" />
      </form>

      <!-- Giving invite codes. -->
      <form class="part" @submit.prevent="giveCodes">
        <!-- Invite codes the account can hand out. -->
        <h4>Codes to pass on</h4>
        <div class="inline-form">
          <UiTextField id="give-count" v-model="inviteCount" label="How many" type="number" min="1" max="100" />
          <UiButton type="submit" variant="secondary" :busy="busy === 'codes'">Give the codes</UiButton>
        </div>
        <UiNotice v-if="failed('codes')" type="error" :message="failed('codes')" />
      </form>

      <!-- Who invited the account and whom it invited, and the codes it holds. -->
      <section class="part" aria-labelledby="tree-title">
        <!-- The invite tree. -->
        <h4 id="tree-title">Invite tree</h4>
        <p v-if="detail.account.invitedBy">
          Invited by <UiButton variant="link" @click="account = detail.account.invitedBy">{{ short(detail.account.invitedBy) }}</UiButton>
        </p>
        <p v-else>Not invited by another account.</p>
        <ul v-if="detail.invitees.length" class="tree">
          <li v-for="i in detail.invitees" :key="i.id">
            <UiButton variant="link" @click="account = i.id">{{ i.handle }}</UiButton> <UiBadge :tone="statusTone(i.status)">{{ i.status }}</UiBadge>
          </li>
        </ul>
        <p v-else>Has invited nobody.</p>
        <UiDataTable caption="Codes held" :rows="detail.invites.length" empty="No codes held.">
          <template #head>
            <th scope="col">Code id</th>
            <th scope="col">Expires</th>
            <th scope="col">State</th>
          </template>
          <tr v-for="i in detail.invites" :key="i.id">
            <th scope="row"><code :title="i.id">{{ short(i.id) }}</code></th>
            <td>{{ day(i.expiresAt) }}</td>
            <td>{{ i.revokedAt ? 'revoked' : i.redeemedBy ? 'used' : 'unused' }}</td>
          </tr>
        </UiDataTable>
      </section>

      <!-- Billing. -->
      <div class="part">
        <!-- The billing history. -->
        <h4 id="bill-title">Billing</h4>
        <UiDataTable caption="Billing" :rows="detail.billing.length" empty="No billing events.">
          <template #head>
            <th scope="col">When</th>
            <th scope="col">Kind</th>
            <th scope="col">Months</th>
            <th scope="col">Amount</th>
            <th scope="col">Provider</th>
          </template>
          <tr v-for="(b, n) in detail.billing" :key="n">
            <th scope="row">{{ when(b.at) }}</th>
            <td>{{ b.kind }}</td>
            <td>{{ b.months }}</td>
            <td>{{ money(b.amountPence) }}</td>
            <td>{{ b.provider }}</td>
          </tr>
        </UiDataTable>
        <p v-if="detail.domains.length">Domains: {{ detail.domains.map((d) => `${d.hostname} (${d.status})`).join(', ') }}</p>
      </div>

      <!-- The account's audit trail. -->
      <section class="part" aria-labelledby="audit-title">
        <!-- The account's audit trail. -->
        <h4 id="audit-title">Audit trail</h4>
        <UiDataTable caption="Audit trail of the account" :rows="detail.audit.length" empty="Nothing recorded.">
          <template #head>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">What</th>
            <th scope="col">Details</th>
          </template>
          <tr v-for="(e, n) in detail.audit" :key="n">
            <th scope="row">{{ when(e.at) }}</th>
            <td>{{ e.actor }}</td>
            <td>{{ e.action }}</td>
            <td><code class="details">{{ JSON.stringify(e.details) }}</code></td>
          </tr>
        </UiDataTable>
      </section>
    </article>
  </div>
</template>

<style scoped>
/* The section, the open account and its parts are columns with the shared gap. */
.accounts,
.detail,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The parts are spaced. */
.accounts {
  gap: var(--space-md);
}

/* The open account is separated by a rule. */
.detail {
  gap: var(--space-lg);
  padding-block-start: var(--space-md);
  border-block-start: 1px solid var(--border);
}

/* No default margins. */
h2,
h3,
h4,
p {
  margin: 0;
}

/* A form's fields on one wrapping row. */
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* An indented list. */
.tree {
  margin: 0;
  padding-inline-start: var(--space-lg);
}

/* Long details may break anywhere. */
.details {
  overflow-wrap: anywhere;
}
</style>
