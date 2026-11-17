<script setup lang="ts">
// A group of links: its title, whether it starts open, its links (each with its own controls), and the group's own move and remove.
import { computed } from 'vue'
import { UiButton, UiCheckField, UiTextField } from '@meddleware/ui'
import LinkFields from './LinkFields.vue'
import { canMove, errorFor, fieldId, itemKey, locate, messagesFor, type GroupDoc } from './model.js'
import { useEditor } from './context.js'

const props = defineProps<{ id: string }>()
const e = useEditor()

const at = computed(() => locate(e.doc, props.id))
const group = computed(() => at.value?.list[at.value.index] as GroupDoc | undefined)
function setOpen(v: boolean): void {
  if (group.value) group.value.open = v || undefined
}
const name = computed(() => group.value?.title.trim() || 'untitled group')
const k = (field: string) => itemKey(props.id, field)
const own = computed(() => [...messagesFor(e.placed.value, k('')), ...messagesFor(e.placed.value, k('items'))])
</script>

<template>
  <fieldset v-if="group" :id="fieldId(k(''))" class="group-fields">
    <legend>Group {{ (at?.index ?? 0) + 1 }} of {{ at?.list.length }}: {{ name }}</legend>
    <p v-for="m in own" :key="m" class="field-error">{{ m }}</p>
    <UiTextField :id="fieldId(k('title'))" v-model="group.title" label="Group title" :error="errorFor(e.placed.value, k('title'))" :maxlength="e.limits.value?.groupTitle" />
    <UiCheckField :model-value="!!group.open" label="Show the group open" @update:model-value="setOpen" />
    <ol v-if="group.items.length" class="group-links">
      <li v-for="l in group.items" :key="l.id"><LinkFields :id="l.id" /></li>
    </ol>
    <p v-else class="group-empty">No links in this group yet.</p>
    <p class="item-actions">
      <UiButton variant="secondary" size="sm" @click="e.addLink(id)">Add a link to this group<span class="mw-visually-hidden"> ({{ name }})</span></UiButton>
      <UiButton :id="`up-${id}`" variant="secondary" size="sm" :disabled="!canMove(e.doc, id, -1)" @click="e.move(id, -1)">
        Move group up<span class="mw-visually-hidden"> ({{ name }})</span>
      </UiButton>
      <UiButton :id="`down-${id}`" variant="secondary" size="sm" :disabled="!canMove(e.doc, id, 1)" @click="e.move(id, 1)">
        Move group down<span class="mw-visually-hidden"> ({{ name }})</span>
      </UiButton>
      <UiButton variant="ghost" size="sm" @click="e.remove(id)">Remove group<span class="mw-visually-hidden"> ({{ name }})</span></UiButton>
    </p>
  </fieldset>
</template>

<style scoped>
.group-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border: 2px solid var(--border);
  border-radius: var(--radius);
}

.group-fields legend {
  padding: 0 var(--space-2xs);
  font-weight: var(--font-weight-bold);
}

.group-links {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
}

.group-empty,
.field-error {
  margin: 0;
}

.field-error {
  padding-inline-start: var(--space-xs);
  border-inline-start: 4px solid var(--danger);
  font-weight: var(--font-weight-semibold);
}
</style>
