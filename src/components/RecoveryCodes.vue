<script setup lang="ts">
// The ten recovery codes, shown once (at sign-up, or when replaced): only their hashes are kept, so this is the only time anyone sees
// them. The person confirms they saved them before moving on.
import { ref } from 'vue'
import { UiButton, UiCheckField, UiCopyButton, UiNotice } from '@meddleware/ui'

const props = withDefaults(defineProps<{ codes: string[]; level?: 2 | 3 }>(), { level: 2 })
const emit = defineEmits<{ done: [] }>()
const saved = ref(false)
</script>

<template>
  <section class="recovery" aria-labelledby="recovery-title">
    <component :is="`h${props.level}`" id="recovery-title">Your recovery codes</component>
    <UiNotice type="warning" message="These are shown only now. Keep them somewhere safe: each one signs you in once if you lose your passkey or wallet." />
    <ol class="recovery-codes">
      <li v-for="c in codes" :key="c"><code>{{ c }}</code></li>
    </ol>
    <p class="recovery-copy">Copy all ten <UiCopyButton :value="codes.join('\n')" label="Copy all recovery codes" /></p>
    <UiCheckField v-model="saved" label="I saved these codes" />
    <p><UiButton :disabled="!saved" @click="emit('done')">Continue</UiButton></p>
  </section>
</template>

<style scoped>
.recovery {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.recovery-codes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-2xs) var(--space-lg);
  margin: 0;
  padding-inline-start: var(--space-lg);
  font-family: var(--mw-font-mono);
}

.recovery-copy {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  margin: 0;
}

.recovery p {
  margin: 0;
}
</style>
