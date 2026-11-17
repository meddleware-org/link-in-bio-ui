<script setup lang="ts">
// The list of problems the service found, each linked to its field, at the top of the form (and focused after a refused save).
import { ref } from 'vue'
import type { Issue } from '../api/errors.js'
import { fieldId } from '../editor/model.js'

defineProps<{ issues: Array<Issue & { key: string }>; title?: string; known: (key: string) => boolean }>()
const root = ref<HTMLElement | null>(null)
defineExpose({ focus: () => root.value?.focus() })
</script>

<template>
  <section ref="root" class="issue-summary" tabindex="-1" aria-labelledby="issue-summary-title">
    <h3 id="issue-summary-title">{{ title ?? 'The page was not saved' }}</h3>
    <ul>
      <li v-for="(i, n) in issues" :key="n">
        <a v-if="known(i.key)" :href="`#${fieldId(i.key)}`">{{ i.message }}</a>
        <template v-else>{{ i.message }}</template>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.issue-summary {
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--danger);
  border-radius: var(--radius);
}

.issue-summary h3 {
  margin: 0 0 var(--space-xs);
}

.issue-summary ul {
  margin: 0;
  padding-inline-start: var(--space-lg);
}
</style>
