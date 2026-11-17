<script setup lang="ts">
// Invite codes: issued here only, never automatically. Codes for the operator to hand out are shown once, here; codes given to an
// account are shown to that account in the app. Unused codes can be revoked.
import { computed, onMounted, ref } from 'vue'
import { UiButton, UiCopyButton, UiDataTable, UiLiveStatus, UiNotice, UiSegmentedControl, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { InviteRow, Issued } from '../../api/types.js'
import { day, short } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api, openAccount } = useConsole()
const invites = ref<InviteRow[]>([])
const to = ref<'me' | 'account'>('me')
const handle = ref('')
const count = ref('5')
const days = ref('30')
const note = ref('')
const issued = ref<Issued | null>(null)
const status = ref('')
const problem = ref('')
const busy = ref('')

async function load(): Promise<void> {
  try {
    invites.value = (await api.invites()).invites
  } catch (e) {
    problem.value = describeError(e)
  }
}
onMounted(load)

async function issue(): Promise<void> {
  if (busy.value) return
  busy.value = 'issue'
  problem.value = ''
  issued.value = null
  try {
    let heldBy: string | undefined
    if (to.value === 'account') {
      const h = handle.value.trim().toLowerCase()
      const match = (await api.accounts(h)).accounts.find((a) => a.handle === h)
      if (!match) throw new Error(`No account has the handle ${h}.`)
      heldBy = match.id
    }
    const r = await api.issue({ count: Number(count.value), heldBy, note: note.value.trim() || undefined, expiresInDays: Number(days.value) })
    issued.value = r
    status.value = heldBy ? `${r.issued} codes given to ${handle.value.trim()}.` : `${r.issued} codes issued. Copy them now: they are not shown again.`
    note.value = ''
    await load()
  } catch (e) {
    problem.value = e instanceof Error && !('status' in e) ? e.message : describeError(e)
  } finally {
    busy.value = ''
  }
}

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

const TO = [
  { id: 'me', label: 'For me to hand out' },
  { id: 'account', label: 'For an account to pass on' },
]
const state = (i: InviteRow) => (i.revokedAt ? `revoked ${day(i.revokedAt)}` : i.redeemedAt ? `used ${day(i.redeemedAt)}` : new Date(i.expiresAt) < new Date() ? 'expired' : 'unused')
const shownCodes = computed(() => issued.value?.codes ?? [])
</script>

<template>
  <div class="invites">
    <h2>Invites</h2>
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
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus label="Invites" :message="status" />

    <section v-if="shownCodes.length" class="part issued" aria-labelledby="inv-issued">
      <h3 id="inv-issued">New codes, shown once</h3>
      <UiNotice type="warning" message="Copy these now. Only their hashes are kept; they are not shown again." />
      <ul class="codes">
        <li v-for="c in shownCodes" :key="c"><code>{{ c }}</code> <UiCopyButton :value="c" :label="`Copy the code ${c}`" /></li>
      </ul>
      <p>Copy all <UiCopyButton :value="shownCodes.join('\n')" label="Copy all new codes" /></p>
    </section>

    <section class="part" aria-labelledby="inv-list">
      <h3 id="inv-list">Issued</h3>
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
.invites,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.invites {
  gap: var(--space-lg);
}

h2,
h3,
p {
  margin: 0;
}

.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.codes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
  gap: var(--space-2xs) var(--space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
