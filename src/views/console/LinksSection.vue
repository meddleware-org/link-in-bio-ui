<script setup lang="ts">
// An operator's verdict on one link: clean (shown whatever the screening says), flagged (hidden on every page), or back to automatic
// screening.
import { ref } from 'vue'
import { UiButton, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
import { describeError } from '../../api/errors.js'
import { useConsole } from './console.js'

const { api } = useConsole()
const url = ref('')
const verdict = ref('flagged')
const status = ref('')
const problem = ref('')
const busy = ref(false)

async function save(): Promise<void> {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
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
    <h2>Link verdict</h2>
    <p>Overrides the automatic screening of one exact address, on every page that links to it.</p>
    <form class="part" @submit.prevent="save">
      <UiTextField id="lv-url" v-model="url" label="Address" type="url" hint="https://… or mailto:…" spellcheck="false" required />
      <UiSelectField id="lv-verdict" v-model="verdict" label="Verdict" :options="VERDICTS" />
      <p><UiButton type="submit" :busy="busy" :disabled="!url.trim()">Record the verdict</UiButton></p>
    </form>
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiLiveStatus label="Link verdict" :message="status" />
  </div>
</template>

<style scoped>
.links,
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-inline-size: var(--mw-tool-content-max);
}

h2,
p {
  margin: 0;
}
</style>
