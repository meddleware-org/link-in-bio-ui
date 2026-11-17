<script setup lang="ts">
// Saved selections of accounts (criteria: age, a published page, paid, invitees in good standing, a tag), the accounts each matches
// now, and "issue K codes" to every matching account that may pass codes on.
import { onMounted, ref } from 'vue'
import { UiButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { AccountRow, Criteria, Selection } from '../../api/types.js'
import { day } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api, openAccount } = useConsole()
const selections = ref<Selection[]>([])
const name = ref('')
const minAge = ref('')
const published = ref('')
const paid = ref('')
const good = ref('')
const tag = ref('')
const matches = ref<{ id: string; rows: AccountRow[] } | null>(null)
const perAccount = ref<Record<string, string>>({})
const status = ref('')
const problem = ref('')
const busy = ref('')

async function load(): Promise<void> {
  try {
    selections.value = (await api.selections()).selections
  } catch (e) {
    problem.value = describeError(e)
  }
}
onMounted(load)

async function act(key: string, f: () => Promise<string>): Promise<void> {
  if (busy.value) return
  busy.value = key
  problem.value = ''
  try {
    status.value = await f()
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = ''
  }
}

const tri = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null)
const create = () =>
  act('create', async () => {
    const criteria: Criteria = {
      minAgeDays: minAge.value ? Number(minAge.value) : null,
      published: tri(published.value),
      paid: tri(paid.value),
      inviteesInGoodStanding: tri(good.value),
      tag: tag.value.trim().toLowerCase() || null,
    }
    await api.createSelection({ name: name.value.trim(), criteria })
    name.value = minAge.value = published.value = paid.value = good.value = tag.value = ''
    await load()
    return 'Selection saved.'
  })
const show = (s: Selection) =>
  act(`m-${s.id}`, async () => {
    matches.value = { id: s.id, rows: (await api.matches(s.id)).accounts }
    return `${s.name} matches ${matches.value.rows.length} account${matches.value.rows.length === 1 ? '' : 's'} now.`
  })
const issue = (s: Selection) =>
  act(`i-${s.id}`, async () => {
    const r = await api.issueToSelection(s.id, { perAccount: Number(perAccount.value[s.id] || '1') })
    return `${r.codes} codes given to ${r.accounts} account${r.accounts === 1 ? '' : 's'} (only those that may pass codes on).`
  })
const remove = (s: Selection) =>
  act(`d-${s.id}`, async () => {
    await api.deleteSelection(s.id)
    if (matches.value?.id === s.id) matches.value = null
    await load()
    return `Deleted ${s.name}.`
  })

function describe(c: Criteria): string {
  const parts: string[] = []
  if (c.minAgeDays) parts.push(`at least ${c.minAgeDays} days old`)
  if (c.published !== null && c.published !== undefined) parts.push(c.published ? 'page published' : 'page not published')
  if (c.paid !== null && c.paid !== undefined) parts.push(c.paid ? 'paid' : 'not paid')
  if (c.inviteesInGoodStanding) parts.push('invitees in good standing')
  if (c.tag) parts.push(`tagged ${c.tag}`)
  return parts.join(', ') || 'every active account'
}
const YES_NO = [
  ['yes', 'Yes'],
  ['no', 'No'],
] as const
</script>

<template>
  <div class="selections">
    <h2>Selections</h2>
    <form class="part" @submit.prevent="create">
      <h3>New selection</h3>
      <UiTextField id="sel-name" v-model="name" label="Name" :maxlength="80" required />
      <div class="grid">
        <UiTextField id="sel-age" v-model="minAge" label="Account at least this many days old" type="number" min="0" />
        <UiSelectField id="sel-published" v-model="published" label="Page published" placeholder="Either" :options="YES_NO" />
        <UiSelectField id="sel-paid" v-model="paid" label="Paid" placeholder="Either" :options="YES_NO" />
        <UiSelectField id="sel-good" v-model="good" label="Invitees in good standing" placeholder="Either" :options="[['yes', 'Yes']]" />
        <UiTextField id="sel-tag" v-model="tag" label="Tag" />
      </div>
      <p><UiButton type="submit" :busy="busy === 'create'" :disabled="!name.trim()">Save the selection</UiButton></p>
    </form>
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus label="Selections" :message="status" />

    <UiDataTable caption="Saved selections" :rows="selections.length" empty="No selections yet.">
      <template #head>
        <th scope="col">Name</th>
        <th scope="col">Matches accounts that are</th>
        <th scope="col">Codes each</th>
        <th scope="col">Actions</th>
      </template>
      <tr v-for="s in selections" :key="s.id">
        <th scope="row">{{ s.name }}</th>
        <td>{{ describe(s.criteria) }}</td>
        <td>
          <label class="per">
            <span class="mw-visually-hidden">Codes for each account in {{ s.name }}</span>
            <input v-model="perAccount[s.id]" class="per-input" type="number" min="1" max="100" placeholder="1" />
          </label>
        </td>
        <td class="actions">
          <UiButton variant="secondary" size="sm" :busy="busy === `m-${s.id}`" @click="show(s)">See matches<span class="mw-visually-hidden"> ({{ s.name }})</span></UiButton>
          <UiButton variant="secondary" size="sm" :busy="busy === `i-${s.id}`" @click="issue(s)">Issue codes<span class="mw-visually-hidden"> ({{ s.name }})</span></UiButton>
          <UiButton variant="ghost" size="sm" :busy="busy === `d-${s.id}`" @click="remove(s)">Delete<span class="mw-visually-hidden"> ({{ s.name }})</span></UiButton>
        </td>
      </tr>
    </UiDataTable>

    <div v-if="matches" class="part">
      <h3 id="sel-matches">Accounts matched now</h3>
      <UiDataTable caption="Accounts matched now" :rows="matches.rows.length" empty="No account matches.">
        <template #head>
          <th scope="col">Handle</th>
          <th scope="col">Created</th>
          <th scope="col">May pass on codes</th>
          <th scope="col">Action</th>
        </template>
        <tr v-for="a in matches.rows" :key="a.id">
          <th scope="row">{{ a.handle }}</th>
          <td>{{ day(a.createdAt) }}</td>
          <td>{{ a.mayShareInvites ? 'yes' : 'no' }}</td>
          <td><UiButton variant="secondary" size="sm" @click="openAccount(a.id)">Open<span class="mw-visually-hidden"> ({{ a.handle }})</span></UiButton></td>
        </tr>
      </UiDataTable>
    </div>
  </div>
</template>

<style scoped>
.selections,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.selections {
  gap: var(--space-lg);
}

h2,
h3,
p {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
}

.actions {
  white-space: nowrap;
}

.per-input {
  inline-size: 5rem;
  padding: var(--space-3xs) var(--space-xs);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius-sm);
}
</style>
