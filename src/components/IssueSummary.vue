<script setup lang="ts">
// editor/PageEditor.vue (shows it).
// The list of problems the service found, each linked to its field, at the top of the form (and focused after a refused save).
// Vue's reactive reference.
import { ref } from 'vue'
// A finding about a page document.
import type { Issue } from '../api/errors.js'
// The DOM id of a field, so a finding can link to it.
import { fieldId } from '../editor/model.js'

// The findings (each with the field key it was placed on), an optional title, and whether a key has a field to link to.
defineProps<{ issues: Array<Issue & { key: string }>; title?: string; known: (key: string) => boolean }>()
// The section, so a parent can move focus to it.
const root = ref<HTMLElement | null>(null)
// Let the parent focus the summary after a refused save.
defineExpose({ focus: () => root.value?.focus() })
</script>

<template>
  <section ref="root" class="issue-summary" tabindex="-1" aria-labelledby="issue-summary-title">
    <!-- What happened. -->
    <h3 id="issue-summary-title">{{ title ?? 'The page was not saved' }}</h3>
    <ul>
      <!-- One item per finding. -->
      <li v-for="(i, n) in issues" :key="n">
        <!-- Linked to its field when there is one. -->
        <a v-if="known(i.key)" :href="`#${fieldId(i.key)}`">{{ i.message }}</a>
        <!-- A finding about the document as a whole: text only. -->
        <template v-else>{{ i.message }}</template>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* A red-bordered box. */
.issue-summary {
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--danger);
  border-radius: var(--radius);
}

/* No margin above the title. */
.issue-summary h3 {
  margin: 0 0 var(--space-xs);
}

/* An indented list with no margin. */
.issue-summary ul {
  margin: 0;
  padding-inline-start: var(--space-lg);
}
</style>
