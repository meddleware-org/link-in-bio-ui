<script setup lang="ts">
// Saved selections of accounts (criteria: age, a published page, paid, invitees in good standing, a tag), the accounts each matches
// now, and "issue K codes" to every matching account that may pass codes on.
// Vue's lifecycle and reactive reference.
import { onMounted, ref } from 'vue'
// The shared button, table, live status, notice, select and text field.
import { UiButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// The shapes this section reads.
import type { AccountRow, Criteria, Selection } from '../../api/types.js'
// A date for people.
import { day } from '../../lib/format.js'
// The console context: the API and a way to open an account.
import { useConsole } from './console.js'

// The typed operator API, and a way to open an account in the accounts section.
const { api, openAccount } = useConsole()
// The saved selections.
const selections = ref<Selection[]>([])
// The new selection's name.
const name = ref('')
// The criteria being typed: a minimum account age, whether a page is published, whether the account paid, invitees in good standing, and a tag.
const minAge = ref('')
const published = ref('')
const paid = ref('')
const good = ref('')
const tag = ref('')
// The accounts one selection matches now.
const matches = ref<{ id: string; rows: AccountRow[] } | null>(null)
// How many codes to issue to each account, by selection.
const perAccount = ref<Record<string, string>>({})
// A polite announcement of what was done.
const status = ref('')
// A failed request, in words.
const problem = ref('')
// Which action is in flight.
const busy = ref('')

/** Read the selections. */
async function load(): Promise<void> {
  try {
    selections.value = (await api.selections()).selections
  } catch (e) {
    problem.value = describeError(e)
  }
}
// Read when the section opens.
onMounted(load)

/** Run one action: one at a time; the result is announced. */
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

// A yes/no/either choice as true, false or null (no condition).
const tri = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null)
// Save a selection with the criteria typed (empty criteria are left out).
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
// Show the accounts a selection matches now.
const show = (s: Selection) =>
  act(`m-${s.id}`, async () => {
    matches.value = { id: s.id, rows: (await api.matches(s.id)).accounts }
    return `${s.name} matches ${matches.value.rows.length} account${matches.value.rows.length === 1 ? '' : 's'} now.`
  })
// Issue codes to every matching account that may pass codes on.
const issue = (s: Selection) =>
  act(`i-${s.id}`, async () => {
    const r = await api.issueToSelection(s.id, { perAccount: Number(perAccount.value[s.id] || '1') })
    return `${r.codes} codes given to ${r.accounts} account${r.accounts === 1 ? '' : 's'} (only those that may pass codes on).`
  })
// Delete a selection.
const remove = (s: Selection) =>
  act(`d-${s.id}`, async () => {
    await api.deleteSelection(s.id)
    if (matches.value?.id === s.id) matches.value = null
    await load()
    return `Deleted ${s.name}.`
  })

/** A selection's criteria in words. */
function describe(c: Criteria): string {
  const parts: string[] = []
  if (c.minAgeDays) parts.push(`at least ${c.minAgeDays} days old`)
  if (c.published !== null && c.published !== undefined) parts.push(c.published ? 'page published' : 'page not published')
  if (c.paid !== null && c.paid !== undefined) parts.push(c.paid ? 'paid' : 'not paid')
  if (c.inviteesInGoodStanding) parts.push('invitees in good standing')
  if (c.tag) parts.push(`tagged ${c.tag}`)
  return parts.join(', ') || 'every active account'
}
// The yes and no choices.
const YES_NO = [
  ['yes', 'Yes'],
  ['no', 'No'],
] as const
</script>

<template>
  <div class="selections">
    <!-- The section's heading. -->
    <h2>Selections</h2>
    <!-- Making a selection. -->
    <form class="part" @submit.prevent="create">
      <h3>New selection</h3>
      <!-- The selection's name. -->
      <UiTextField id="sel-name" v-model="name" label="Name" :maxlength="80" required />
      <!-- The criteria fields. -->
      <div class="grid">
        <UiTextField id="sel-age" v-model="minAge" label="Account at least this many days old" type="number" min="0" />
        <!-- Whether the account has a published page. -->
        <UiSelectField id="sel-published" v-model="published" label="Page published" placeholder="Either" :options="YES_NO" />
        <!-- Whether the account has paid. -->
        <UiSelectField id="sel-paid" v-model="paid" label="Paid" placeholder="Either" :options="YES_NO" />
        <UiSelectField id="sel-good" v-model="good" label="Invitees in good standing" placeholder="Either" :options="[['yes', 'Yes']]" />
        <!-- A tag the account must carry. -->
        <UiTextField id="sel-tag" v-model="tag" label="Tag" />
      </div>
      <p><UiButton type="submit" :busy="busy === 'create'" :disabled="!name.trim()">Save the selection</UiButton></p>
    </form>
    <!-- A failed request. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus label="Selections" :message="status" />

    <!-- One row per selection: its criteria in words, codes each and its actions. -->
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
          <!-- How many codes each account would get; the label is for assistive technology only. -->
          <label class="per">
            <span class="mw-visually-hidden">Codes for each account in {{ s.name }}</span>
            <input v-model="perAccount[s.id]" class="per-input" type="number" min="1" max="100" placeholder="1" />
          </label>
        </td>
        <!-- See the matches, issue codes, delete. -->
        <td class="actions">
          <UiButton variant="secondary" size="sm" :busy="busy === `m-${s.id}`" @click="show(s)">See matches<span class="mw-visually-hidden"> ({{ s.name }})</span></UiButton>
          <UiButton variant="secondary" size="sm" :busy="busy === `i-${s.id}`" @click="issue(s)">Issue codes<span class="mw-visually-hidden"> ({{ s.name }})</span></UiButton>
          <UiButton variant="ghost" size="sm" :busy="busy === `d-${s.id}`" @click="remove(s)">Delete<span class="mw-visually-hidden"> ({{ s.name }})</span></UiButton>
        </td>
      </tr>
    </UiDataTable>

    <!-- The accounts the chosen selection matches now. -->
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
/* The section and its parts are columns with the shared gap. */
.selections,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The parts are spaced. */
.selections {
  gap: var(--space-lg);
}

/* No default margins. */
h2,
h3,
p {
  margin: 0;
}

/* As many columns as fit. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
}

/* The action buttons stay on one line. */
.actions {
  white-space: nowrap;
}

/* A narrow number input that uses the form-control tokens. */
.per-input {
  inline-size: 5rem;
  padding: var(--space-3xs) var(--space-xs);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--control-border);
  border-radius: var(--radius-sm);
}
</style>
