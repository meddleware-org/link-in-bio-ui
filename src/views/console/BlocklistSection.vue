<script setup lang="ts">
// The operator's blocklist: hosts and exact URLs that screening treats as flagged.
import { onMounted, ref } from 'vue'
import { UiButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { BlockEntry } from '../../api/types.js'
import { day } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api } = useConsole()
const entries = ref<BlockEntry[]>([])
const pattern = ref('')
const kind = ref<'host' | 'url'>('host')
const reason = ref('')
const status = ref('')
const problem = ref('')
const busy = ref('')

async function load(): Promise<void> {
  try {
    entries.value = (await api.blocklist()).entries
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
    await load()
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = ''
  }
}
const add = () =>
  act('add', async () => {
    await api.block({ pattern: pattern.value.trim(), kind: kind.value, reason: reason.value.trim() })
    const p = pattern.value.trim()
    pattern.value = reason.value = ''
    return `Blocked ${p}.`
  })
const remove = (p: string) =>
  act(p, async () => {
    await api.unblock(p)
    return `Unblocked ${p}.`
  })
const KINDS = [
  ['host', 'A host (and everything on it)'],
  ['url', 'One exact address'],
] as const
</script>

<template>
  <div class="blocklist">
    <h2>Blocklist</h2>
    <form class="part" @submit.prevent="add">
      <h3>Block</h3>
      <div class="grid">
        <UiSelectField id="bl-kind" v-model="kind" label="What" :options="KINDS" />
        <UiTextField id="bl-pattern" v-model="pattern" :label="kind === 'host' ? 'Host' : 'Address'" :hint="kind === 'host' ? 'for example bad.example' : 'https://…'" spellcheck="false" required />
        <UiTextField id="bl-reason" v-model="reason" label="Reason" :maxlength="200" required />
      </div>
      <p><UiButton type="submit" :busy="busy === 'add'" :disabled="!pattern.trim() || !reason.trim()">Block it</UiButton></p>
    </form>
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus label="Blocklist" :message="status" />
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
.blocklist,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.blocklist {
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

.pattern {
  overflow-wrap: anywhere;
}
</style>
