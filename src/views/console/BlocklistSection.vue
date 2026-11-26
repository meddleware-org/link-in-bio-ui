<script setup lang="ts">
// The operator's blocklist: hosts and exact URLs that screening treats as flagged.
// Vue's lifecycle and reactive reference.
import { onMounted, ref } from 'vue'
// The shared button, table, live status, notice, select and text field.
import { UiButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// One blocklist entry.
import type { BlockEntry } from '../../api/types.js'
// A date for people.
import { day } from '../../lib/format.js'
// The console context.
import { useConsole } from './console.js'

// The typed operator API.
const { api } = useConsole()
// The entries.
const entries = ref<BlockEntry[]>([])
// The host or address to block.
const pattern = ref('')
// Whether the pattern is a host or one exact address.
const kind = ref<'host' | 'url'>('host')
// Why it is blocked.
const reason = ref('')
// A polite announcement of what was done.
const status = ref('')
// A failed request, in words.
const problem = ref('')
// Which action is in flight.
const busy = ref('')

/** Read the blocklist. */
async function load(): Promise<void> {
  try {
    entries.value = (await api.blocklist()).entries
  } catch (e) {
    problem.value = describeError(e)
  }
}
// Read when the section opens.
onMounted(load)

/** Run one change: one at a time; on success announce it and read the list again. */
async function act(key: string, f: () => Promise<string>): Promise<void> {
  if (busy.value) return
  busy.value = key
  problem.value = ''
  try {
    status.value = await f()
    await load()
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = ''
  }
}
// Block a host or an exact address, with a reason.
const add = () =>
  act('add', async () => {
    await api.block({ pattern: pattern.value.trim(), kind: kind.value, reason: reason.value.trim() })
    const p = pattern.value.trim()
    pattern.value = reason.value = ''
    return `Blocked ${p}.`
  })
// Unblock a pattern.
const remove = (p: string) =>
  act(p, async () => {
    await api.unblock(p)
    return `Unblocked ${p}.`
  })
// The two kinds of entry.
const KINDS = [
  ['host', 'A host (and everything on it)'],
  ['url', 'One exact address'],
] as const
</script>

<template>
  <div class="blocklist">
    <!-- The section's heading. -->
    <h2>Blocklist</h2>
    <!-- Adding an entry. -->
    <form class="part" @submit.prevent="add">
      <h3>Block</h3>
      <div class="grid">
        <UiSelectField id="bl-kind" v-model="kind" label="What" :options="KINDS" />
        <UiTextField id="bl-pattern" v-model="pattern" :label="kind === 'host' ? 'Host' : 'Address'" :hint="kind === 'host' ? 'for example bad.example' : 'https://…'" spellcheck="false" required />
        <UiTextField id="bl-reason" v-model="reason" label="Reason" :maxlength="200" required />
      </div>
      <p><UiButton type="submit" :busy="busy === 'add'" :disabled="!pattern.trim() || !reason.trim()">Block it</UiButton></p>
    </form>
    <!-- A failed request. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus label="Blocklist" :message="status" />
    <!-- The entries, with who added each and when. -->
    <UiDataTable caption="Blocked hosts and addresses" :rows="entries.length" empty="Nothing is blocked.">
      <template #head>
        <th scope="col">Pattern</th>
        <th scope="col">Kind</th>
        <th scope="col">Reason</th>
        <th scope="col">Added</th>
        <th scope="col">Action</th>
      </template>
      <tr v-for="b in entries" :key="b.pattern">
        <th scope="row"><code class="pattern">{{ b.pattern }}</code></th>
        <td>{{ b.kind }}</td>
        <td>{{ b.reason }}</td>
        <td>{{ day(b.addedAt) }} by {{ b.addedBy }}</td>
        <td><UiButton variant="ghost" size="sm" :busy="busy === b.pattern" @click="remove(b.pattern)">Unblock<span class="mw-visually-hidden"> ({{ b.pattern }})</span></UiButton></td>
      </tr>
    </UiDataTable>
  </div>
</template>

<style scoped>
/* The section and the form are columns with the shared gap. */
.blocklist,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The parts are spaced. */
.blocklist {
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

/* Long patterns may break anywhere. */
.pattern {
  overflow-wrap: anywhere;
}
</style>
