<script setup lang="ts">
// The audit log: every operator action and account event, newest first, optionally for one subject (an account id, a pattern, a URL).
import { onMounted, ref } from 'vue'
import { UiButton, UiDataTable, UiNotice, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import type { AuditEntry } from '../../api/types.js'
import { when } from '../../lib/format.js'
import { useConsole } from './console.js'

const { api } = useConsole()
const subject = ref('')
const entries = ref<AuditEntry[]>([])
const problem = ref('')

async function load(): Promise<void> {
  problem.value = ''
  try {
    entries.value = (await api.audit(subject.value.trim() || undefined)).entries
  } catch (e) {
    problem.value = describeError(e)
  }
}
onMounted(load)
</script>

<template>
  <div class="audit">
    <h2>Audit log</h2>
    <form class="inline-form" @submit.prevent="load">
      <UiTextField id="audit-subject" v-model="subject" label="Subject (optional)" hint="an account id, a pattern or an address" spellcheck="false" />
      <UiButton type="submit" variant="secondary">Show</UiButton>
    </form>
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiDataTable caption="Audit log" :rows="entries.length" empty="Nothing recorded.">
      <template #head>
        <th scope="col">When</th>
        <th scope="col">Who</th>
        <th scope="col">What</th>
        <th scope="col">Subject</th>
        <th scope="col">Details</th>
      </template>
      <tr v-for="e in entries" :key="e.id">
        <th scope="row">{{ when(e.at) }}</th>
        <td>{{ e.actor }}</td>
        <td>{{ e.action }}</td>
        <td><code class="wrap">{{ e.subject }}</code></td>
        <td><code class="wrap">{{ JSON.stringify(e.details) }}</code></td>
      </tr>
    </UiDataTable>
  </div>
</template>

<style scoped>
.audit {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

h2 {
  margin: 0;
}

.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.wrap {
  overflow-wrap: anywhere;
}
</style>
