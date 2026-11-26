<script setup lang="ts">
// Invite codes: issued here only, never automatically. Codes for the operator to hand out are shown once, here; codes given to an
// account are shown to that account in the app. Unused codes can be revoked.
// Vue's reactivity and lifecycle.
import { computed, onMounted, ref } from 'vue'
// The shared button, copy button, table, live status, notice, segmented control and text field.
import { UiButton, UiCopyButton, UiDataTable, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// An invite row and a batch just issued.
import type { InviteRow, Issued } from '../../api/types.js'
// Dates and shortened ids for people.
import { day, short } from '../../lib/format.js'
// The console context: the API and a way to open an account.
import { useConsole } from './console.js'

// The typed operator API, and a way to open an account in the accounts section.
const { api, openAccount } = useConsole()
// The invites issued.
const invites = ref<InviteRow[]>([])
// Whether the codes are for the operator to hand out or for an account to pass on.
const to = ref<'me' | 'account'>('me')
// The account's handle, when the codes are for one.
const handle = ref('')
// How many codes.
const count = ref('5')
// How many days they are valid.
const days = ref('30')
// A note for the operator.
const note = ref('')
// The batch just issued: its codes are shown once, here.
const issued = ref<Issued | null>(null)
// A polite announcement of what was done.
const status = ref('')
// A failed request, in words.
const problem = ref('')
// Which action is in flight.
const busy = ref('')

/** Read the invites. */
async function load(): Promise<void> {
  try {
    invites.value = (await api.invites()).invites
  } catch (e) {
    problem.value = describeError(e)
  }
}
// Read when the section opens.
onMounted(load)

/** Issue codes, for an account (looked up by handle) or for the operator to hand out. */
async function issue(): Promise<void> {
  if (busy.value) return
  busy.value = 'issue'
  problem.value = ''
  issued.value = null
  try {
    // The account that will hold the codes, if any.
    let heldBy: string | undefined
    if (to.value === 'account') {
      const h = handle.value.trim().toLowerCase()
      // Find the account with exactly this handle.
      const match = (await api.accounts(h)).accounts.find((a) => a.handle === h)
      // No such account: say so in words.
      if (!match) throw new Error(`No account has the handle ${h}.`)
      heldBy = match.id
    }
    // Issue them; empty optional fields are left out.
    const r = await api.issue({ count: Number(count.value), heldBy, note: note.value.trim() || undefined, expiresInDays: Number(days.value) })
    issued.value = r
    status.value = heldBy ? `${r.issued} codes given to ${handle.value.trim()}.` : `${r.issued} codes issued. Copy them now: they are not shown again.`
    note.value = ''
    await load()
  } catch (e) {
    // This section's own message is shown as it is; an API error goes through the shared words.
    problem.value = e instanceof Error && !('status' in e) ? e.message : describeError(e)
  } finally {
    busy.value = ''
  }
}

/** Revoke an unused code. */
async function revoke(id: string): Promise<void> {
  if (busy.value) return
  busy.value = id
  problem.value = ''
  try {
    await api.revoke(id)
    status.value = 'Code revoked.'
    await load()
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = ''
  }
}

// The two choices of who gets the codes.
const TO = [
  { id: 'me', label: 'For me to hand out' },
  { id: 'account', label: 'For an account to pass on' },
]
// A code's state in words: revoked, used, expired or unused.
const state = (i: InviteRow) => (i.revokedAt ? `revoked ${day(i.revokedAt)}` : i.redeemedAt ? `used ${day(i.redeemedAt)}` : new Date(i.expiresAt) < new Date() ? 'expired' : 'unused')
// The codes just issued.
const shownCodes = computed(() => issued.value?.codes ?? [])
</script>

<template>
  <div class="invites">
    <!-- The section's heading. -->
    <h2>Invites</h2>
    <!-- Issuing codes. -->
    <form class="part" @submit.prevent="issue">
      <h3>Issue codes</h3>
      <UiSegmentedControl layout="wrap" v-model="to" :options="TO" label="Who gets them" :label-hidden="false" />
      <UiTextField v-if="to === 'account'" id="inv-handle" v-model="handle" label="The account’s handle" spellcheck="false" required />
      <div class="inline-form">
        <UiTextField id="inv-count" v-model="count" label="How many (1 to 100)" type="number" min="1" max="100" />
        <UiTextField id="inv-days" v-model="days" label="Valid for days (1 to 365)" type="number" min="1" max="365" />
      </div>
      <UiTextField id="inv-note" v-model="note" label="Note (optional, for you)" :maxlength="200" />
      <p><UiButton type="submit" :busy="busy === 'issue'">Issue the codes</UiButton></p>
    </form>
    <!-- A failed request. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus label="Invites" :message="status" />

    <!-- The codes just issued, shown once: only their hashes are kept. -->
    <section v-if="shownCodes.length" class="part issued" aria-labelledby="inv-issued">
      <h3 id="inv-issued">New codes, shown once</h3>
      <UiNotice type="warning" message="Copy these now. Only their hashes are kept; they are not shown again." />
      <!-- One code per line with a copy button. -->
      <ul class="codes">
        <li v-for="c in shownCodes" :key="c"><code>{{ c }}</code> <UiCopyButton :value="c" :label="`Copy the code ${c}`" /></li>
      </ul>
      <p>Copy all <UiCopyButton :value="shownCodes.join('\n')" label="Copy all new codes" /></p>
    </section>

    <!-- Every code issued. -->
    <section class="part" aria-labelledby="inv-list">
      <h3 id="inv-list">Issued</h3>
      <!-- One row per code: when, who holds it, the note, when it expires, its state and revoking. -->
      <UiDataTable caption="Issued invite codes" :rows="invites.length" empty="No codes issued yet.">
        <template #head>
          <th scope="col">Issued</th>
          <th scope="col">Held by</th>
          <th scope="col">Note</th>
          <th scope="col">Expires</th>
          <th scope="col">State</th>
          <th scope="col">Action</th>
        </template>
        <tr v-for="i in invites" :key="i.id">
          <th scope="row">{{ day(i.createdAt) }}</th>
          <td>
            <UiButton v-if="i.heldBy" variant="link" @click="openAccount(i.heldBy)">{{ short(i.heldBy) }}</UiButton>
            <template v-else>operator</template>
          </td>
          <td>{{ i.note ?? '' }}</td>
          <td>{{ day(i.expiresAt) }}</td>
          <td>{{ state(i) }}</td>
          <td>
            <UiButton v-if="!i.revokedAt && !i.redeemedAt" variant="ghost" size="sm" :busy="busy === i.id" @click="revoke(i.id)">
              Revoke<span class="mw-visually-hidden"> (code issued {{ day(i.createdAt) }} ({{ short(i.id) }}))</span>
            </UiButton>
          </td>
        </tr>
      </UiDataTable>
    </section>
  </div>
</template>

<style scoped>
/* The section and its parts are columns with the shared gap. */
.invites,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The parts are spaced. */
.invites {
  gap: var(--space-lg);
}

/* No default margins. */
h2,
h3,
p {
  margin: 0;
}

/* The fields on one wrapping row. */
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* As many columns as fit, with no bullets. */
.codes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
  gap: var(--space-2xs) var(--space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
