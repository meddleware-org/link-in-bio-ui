<script setup lang="ts">
// The ten recovery codes, shown once (at sign-up, or when replaced): only their hashes are kept, so this is the only time anyone sees
// them. The person confirms they saved them before moving on.
// Vue's reactive reference.
import { ref } from 'vue'
// The shared button, checkbox, copy button and notice.
import { UiButton, UiCheckField, UiCopyButton, UiNotice } from '@meddleware/ui'

// The codes, and the heading level to use (2 by default).
const props = withDefaults(defineProps<{ codes: string[]; level?: 2 | 3 }>(), { level: 2 })
// Tell the parent when the person has confirmed they saved them.
const emit = defineEmits<{ done: [] }>()
// Whether the person confirmed.
const saved = ref(false)
</script>

<template>
  <section class="recovery" aria-labelledby="recovery-title">
    <!-- The heading, at the level the page needs. -->
    <component :is="`h${props.level}`" id="recovery-title">Your recovery codes</component>
    <!-- Says the codes are shown only now, and what each one does. -->
    <UiNotice type="warning" message="These are shown only now. Keep them somewhere safe: each one signs you in once if you lose your passkey or wallet." />
    <!-- The codes, one per line, in a monospace face. -->
    <ol class="recovery-codes">
      <li v-for="c in codes" :key="c"><code>{{ c }}</code></li>
    </ol>
    <!-- Copy all of them at once. -->
    <p class="recovery-copy">Copy all ten <UiCopyButton :value="codes.join('\n')" label="Copy all recovery codes" /></p>
    <!-- The person confirms they saved them. -->
    <UiCheckField v-model="saved" label="I saved these codes" />
    <!-- Continue is disabled until they have. -->
    <p><UiButton :disabled="!saved" @click="emit('done')">Continue</UiButton></p>
  </section>
</template>

<style scoped>
/* A column with the shared gap. */
.recovery {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* As many columns as fit, in the mono face. */
.recovery-codes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-2xs) var(--space-lg);
  margin: 0;
  padding-inline-start: var(--space-lg);
  font-family: var(--mw-font-mono);
}

/* The copy button beside its label. */
.recovery-copy {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  margin: 0;
}

/* No default paragraph margin. */
.recovery p {
  margin: 0;
}
</style>
