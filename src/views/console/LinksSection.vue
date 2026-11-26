<script setup lang="ts">
// An operator's verdict on one link: clean (shown whatever the screening says), flagged (hidden on every page), or back to automatic
// screening.
// Vue's reactive reference.
import { ref } from 'vue'
// The shared button, live status, notice, select and text field.
import { UiButton, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// The console context.
import { useConsole } from './console.js'

// The typed operator API.
const { api } = useConsole()
// The exact address the verdict is about.
const url = ref('')
// The verdict chosen.
const verdict = ref('flagged')
// A polite announcement of what was done.
const status = ref('')
// A failed save, in words.
const problem = ref('')
// True while the verdict is being saved.
const busy = ref(false)

/** Record the verdict; "automatic" clears it, so screening decides again. */
async function save(): Promise<void> {
  // One save at a time.
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    // Automatic is sent as null.
    const v = verdict.value === 'auto' ? null : (verdict.value as 'clean' | 'flagged')
    await api.linkVerdict({ url: url.value.trim(), verdict: v })
    status.value = v ? `The link is now ${v}.` : 'The link is back to automatic screening.'
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = false
  }
}
const VERDICTS = [
  ['flagged', 'Flagged: hide it on every page'],
  ['clean', 'Clean: show it'],
  ['auto', 'Automatic: let screening decide'],
] as const
</script>

<template>
  <div class="links">
    <!-- The section's heading. -->
    <h2>Link verdict</h2>
    <p>Overrides the automatic screening of one exact address, on every page that links to it.</p>
    <!-- The form. -->
    <form class="part" @submit.prevent="save">
      <UiTextField id="lv-url" v-model="url" label="Address" type="url" hint="https://… or mailto:…" spellcheck="false" required />
      <UiSelectField id="lv-verdict" v-model="verdict" label="Verdict" :options="VERDICTS" />
      <p><UiButton type="submit" :busy="busy" :disabled="!url.trim()">Record the verdict</UiButton></p>
    </form>
    <!-- A failed save. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
    <!-- Announces what was done. -->
    <UiLiveStatus label="Link verdict" :message="status" />
  </div>
</template>

<style scoped>
/* A column with the shared gap and the tool width. */
.links,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-inline-size: var(--mw-tool-content-max);
}

/* No default margins. */
h2,
p {
  margin: 0;
}
</style>
