<script setup lang="ts">
// One link's fields (title, address, description, icon, "this is my profile", hidden), its screening, and the keyboard controls that
// move it up or down its list or remove it. The link is found by its id in the shared document, so it is edited in place.
// Vue's `computed`.
import { computed } from 'vue'
// The shared badge, button, checkbox, select and text field.
import { UiBadge, UiButton, UiCheckField, UiSelectField, UiTextField } from '@meddleware/ui'
// The document operations and the field keys.
import { canMove, errorFor, fieldId, itemKey, locate, messagesFor, type LinkDoc } from './model.js'
// The editor's shared context, and the words for a screening verdict.
import { useEditor, verdictWords } from './context.js'

// The link's id: it is found in the shared document, so it is edited in place.
const props = defineProps<{ id: string }>()
// The shared context.
const e = useEditor()

// Where the link sits.
const at = computed(() => locate(e.doc, props.id))
// A stand-in while the link is being removed (the fieldset is not rendered then), so the template's bindings are never undefined.
// The link, or a stand-in while it is being removed.
const link = computed(() => (at.value?.list[at.value.index] as LinkDoc | undefined) ?? { kind: 'link' as const, id: props.id, title: '', url: '' })
/** Change some fields of the link in place. */
function patch(p: Partial<LinkDoc>): void {
  Object.assign(link.value, p)
}
// The link's name for people and for assistive technology.
const name = computed(() => link.value?.title.trim() || 'untitled link')
// Its place in its list, in words.
const position = computed(() => `${(at.value?.index ?? 0) + 1} of ${at.value?.list.length ?? 0}`)
// The key of one of the link's fields.
const k = (field: string) => itemKey(props.id, field)
// The error for one field.
const err = (field: string) => errorFor(e.placed.value, k(field))
// Issues about the link as a whole.
const own = computed(() => messagesFor(e.placed.value, k('')))
// The icons the service allows, as options.
const iconOptions = computed(() => (e.limits.value?.icons ?? []).map((i) => [i, i] as const))
// The screening verdict for the link's address, in words.
const screen = computed(() => {
  const url = link.value?.url.trim()
  const s = url ? e.screening.value.find((x) => x.url === url) : undefined
  return s ? verdictWords(s.verdict) : null
})
</script>

<template>
  <fieldset v-if="at" :id="fieldId(k(''))" class="link-fields">
    <!-- Which link it is, in which group, and its name. -->
    <legend>Link {{ position }}<template v-if="at?.group"> in “{{ at.group.title || 'untitled group' }}”</template>: {{ name }}</legend>
    <!-- Issues about the link as a whole. -->
    <p v-for="m in own" :key="m" class="field-error">{{ m }}</p>
    <!-- The four text fields. -->
    <div class="link-grid">
      <!-- The link's title. -->
      <UiTextField :id="fieldId(k('title'))" v-model="link.title" label="Title" :error="err('title')" :maxlength="e.limits.value?.linkTitle" />
      <UiTextField
        :id="fieldId(k('url'))"
        v-model="link.url"
        label="Address"
        type="url"
        hint="https://… or mailto:…"
        :error="err('url')"
        inputmode="url"
        autocomplete="url"
      />
      <UiTextField
        :id="fieldId(k('description'))"
        :model-value="link.description ?? ''"
        label="Description (optional)"
        :error="err('description')"
        :maxlength="e.limits.value?.linkDescription"
        @update:model-value="patch({ description: $event })"
      />
      <UiSelectField
        :id="fieldId(k('icon'))"
        :model-value="link.icon ?? ''"
        label="Icon"
        placeholder="None"
        :options="iconOptions"
        :error="err('icon')"
        @update:model-value="patch({ icon: $event || undefined })"
      />
    </div>
    <!-- Two yes-or-no choices. -->
    <div class="link-flags">
      <UiCheckField
        :model-value="!!link.identity"
        label="This is my profile (rel=me)"
        hint="tells other sites this page and that profile are the same person"
        @update:model-value="patch({ identity: $event || undefined })"
      />
      <UiCheckField :model-value="!!link.hidden" label="Hide this link" @update:model-value="patch({ hidden: $event || undefined })" />
    </div>
    <!-- An issue about the profile flag. -->
    <p v-if="err('identity')" :id="fieldId(k('identity'))" class="field-error">{{ err('identity') }}</p>
    <!-- The screening verdict, as a badge with words. -->
    <p v-if="screen" class="link-screen"><UiBadge :tone="screen.tone">{{ screen.text }}</UiBadge></p>
    <!-- Move the link up or down, or remove it; each button names the link for assistive technology. -->
    <p class="item-actions">
      <UiButton :id="`up-${id}`" variant="secondary" size="sm" :disabled="!canMove(e.doc, id, -1)" @click="e.move(id, -1)">
        Move up<span class="mw-visually-hidden"> ({{ name }})</span>
      </UiButton>
      <UiButton :id="`down-${id}`" variant="secondary" size="sm" :disabled="!canMove(e.doc, id, 1)" @click="e.move(id, 1)">
        Move down<span class="mw-visually-hidden"> ({{ name }})</span>
      </UiButton>
      <UiButton variant="ghost" size="sm" @click="e.remove(id)">Remove<span class="mw-visually-hidden"> ({{ name }})</span></UiButton>
    </p>
  </fieldset>
</template>

<style scoped>
/* A bordered column. */
.link-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

/* A semi-bold legend. */
.link-fields legend {
  padding: 0 var(--space-2xs);
  font-weight: var(--font-weight-semibold);
}

/* As many columns as fit. */
.link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
}

/* The flags and the buttons wrap. */
.link-flags,
.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
}

/* No default margin. */
.link-screen,
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
