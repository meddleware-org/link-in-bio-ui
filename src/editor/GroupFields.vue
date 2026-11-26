<script setup lang="ts">
// the editor context), model.ts (the operations).
// A group of links: its title, whether it starts open, its links (each with its own controls), and the group's own move and remove.
// Vue's `computed`.
import { computed } from 'vue'
// The shared button, checkbox and text field.
import { UiButton, UiCheckField, UiTextField } from '@meddleware/ui'
// One link's fields, for the links inside the group.
import LinkFields from './LinkFields.vue'
// The document operations and the field keys.
import { canMove, errorFor, fieldId, itemKey, locate, messagesFor, type GroupDoc } from './model.js'
// The editor's shared context.
import { useEditor } from './context.js'

// The group's id: it is found in the shared document, so it is edited in place.
const props = defineProps<{ id: string }>()
// The shared context.
const e = useEditor()

// Where the group sits in the page.
const at = computed(() => locate(e.doc, props.id))
// The group itself, if it is still there.
const group = computed(() => at.value?.list[at.value.index] as GroupDoc | undefined)
/** Set whether the group starts open (false is stored as absent). */
function setOpen(v: boolean): void {
  if (group.value) group.value.open = v || undefined
}
// The group's name for people and for assistive technology.
const name = computed(() => group.value?.title.trim() || 'untitled group')
// The key of one of the group's fields, for placing issues.
const k = (field: string) => itemKey(props.id, field)
// The group's own issues and those about its list.
const own = computed(() => [...messagesFor(e.placed.value, k('')), ...messagesFor(e.placed.value, k('items'))])
</script>

<template>
  <fieldset v-if="group" :id="fieldId(k(''))" class="group-fields">
    <!-- Which group it is, and its name. -->
    <legend>Group {{ (at?.index ?? 0) + 1 }} of {{ at?.list.length }}: {{ name }}</legend>
    <!-- The group's own issues. -->
    <p v-for="m in own" :key="m" class="field-error">{{ m }}</p>
    <!-- The group's title. -->
    <UiTextField :id="fieldId(k('title'))" v-model="group.title" label="Group title" :error="errorFor(e.placed.value, k('title'))" :maxlength="e.limits.value?.groupTitle" />
    <!-- Whether the group starts open. -->
    <UiCheckField :model-value="!!group.open" label="Show the group open" @update:model-value="setOpen" />
    <!-- The links in the group. -->
    <ol v-if="group.items.length" class="group-links">
      <li v-for="l in group.items" :key="l.id"><LinkFields :id="l.id" /></li>
    </ol>
    <!-- An empty group. -->
    <p v-else class="group-empty">No links in this group yet.</p>
    <!-- Add a link here, move the group, or remove it; each button names the group for assistive technology. -->
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
/* A thick-bordered column. */
.group-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border: 2px solid var(--border);
  border-radius: var(--radius);
}

/* A bold legend. */
.group-fields legend {
  padding: 0 var(--space-2xs);
  font-weight: var(--font-weight-bold);
}

/* The links as a plain column. */
.group-links {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The buttons wrap on a narrow screen. */
.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
}

/* No default margin. */
.group-empty,
/* An issue is marked with a red rule and bold text, so it is not carried by colour alone. */
.field-error {
  margin: 0;
}

.field-error {
  padding-inline-start: var(--space-xs);
  border-inline-start: 4px solid var(--danger);
  font-weight: var(--font-weight-semibold);
}
</style>
