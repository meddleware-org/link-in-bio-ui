<script setup lang="ts">
// The audit log: every operator action and account event, newest first, optionally for one subject (an account id, a pattern, a URL).
// Vue's lifecycle and reactive reference.
import { onMounted, ref } from 'vue'
// The shared button, table, notice and text field.
import { UiButton, UiDataTable, UiNotice, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// One row of the audit trail.
import type { AuditEntry } from '../../api/types.js'
// A date and time for people.
import { when } from '../../lib/format.js'
// The console context.
import { useConsole } from './console.js'

// The typed operator API.
const { api } = useConsole()
// The subject to filter by (empty shows everything).
const subject = ref('')
// The rows.
const entries = ref<AuditEntry[]>([])
// A failed read, in words.
const problem = ref('')

/** Read the audit trail, for one subject when one is given. */
async function load(): Promise<void> {
  problem.value = ''
  try {
    entries.value = (await api.audit(subject.value.trim() || undefined)).entries
  } catch (e) {
    problem.value = describeError(e)
  }
}
// Read when the section opens.
onMounted(load)
</script>

<template>
  <div class="audit">
    <!-- The section's heading. -->
    <h2>Audit log</h2>
    <!-- Filter by subject. -->
    <form class="inline-form" @submit.prevent="load">
      <UiTextField id="audit-subject" v-model="subject" label="Subject (optional)" hint="an account id, a pattern or an address" spellcheck="false" />
      <UiButton type="submit" variant="secondary">Show</UiButton>
    </form>
    <!-- A failed read. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
    <!-- One row per action, newest first. -->
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
        <!-- The subject and the details, which may be long, so they wrap. -->
        <td><code class="wrap">{{ e.subject }}</code></td>
        <td><code class="wrap">{{ JSON.stringify(e.details) }}</code></td>
      </tr>
    </UiDataTable>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.audit {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* No default margin. */
h2 {
  margin: 0;
}

/* The filter's field and button on one wrapping row. */
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* Long values may break anywhere. */
.wrap {
  overflow-wrap: anywhere;
}
</style>
