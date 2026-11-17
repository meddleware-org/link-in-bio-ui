<script setup lang="ts">
// One link's fields (title, address, description, icon, "this is my profile", hidden), its screening, and the keyboard controls that
// move it up or down its list or remove it. The link is found by its id in the shared document, so it is edited in place.
import { computed } from 'vue'
import { UiBadge, UiButton, UiCheckField, UiSelectField, UiTextField } from '@meddleware/ui'
import { canMove, errorFor, fieldId, itemKey, locate, messagesFor, type LinkDoc } from './model.js'
import { useEditor, verdictWords } from './context.js'

const props = defineProps<{ id: string }>()
const e = useEditor()

const at = computed(() => locate(e.doc, props.id))
// A stand-in while the link is being removed (the fieldset is not rendered then), so the template's bindings are never undefined.
const link = computed(() => (at.value?.list[at.value.index] as LinkDoc | undefined) ?? { kind: 'link' as const, id: props.id, title: '', url: '' })
function patch(p: Partial<LinkDoc>): void {
  Object.assign(link.value, p)
}
const name = computed(() => link.value?.title.trim() || 'untitled link')
const position = computed(() => `${(at.value?.index ?? 0) + 1} of ${at.value?.list.length ?? 0}`)
const k = (field: string) => itemKey(props.id, field)
const err = (field: string) => errorFor(e.placed.value, k(field))
const own = computed(() => messagesFor(e.placed.value, k('')))
const iconOptions = computed(() => (e.limits.value?.icons ?? []).map((i) => [i, i] as const))
const screen = computed(() => {
  const url = link.value?.url.trim()
  const s = url ? e.screening.value.find((x) => x.url === url) : undefined
  return s ? verdictWords(s.verdict) : null
})
</script>

<template>
  <fieldset v-if="at" :id="fieldId(k(''))" class="link-fields">
    <legend>Link {{ position }}<template v-if="at?.group"> in “{{ at.group.title || 'untitled group' }}”</template>: {{ name }}</legend>
    <p v-for="m in own" :key="m" class="field-error">{{ m }}</p>
    <div class="link-grid">
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
    <div class="link-flags">
      <UiCheckField
        :model-value="!!link.identity"
        label="This is my profile (rel=me)"
        hint="tells other sites this page and that profile are the same person"
        @update:model-value="patch({ identity: $event || undefined })"
      />
      <UiCheckField :model-value="!!link.hidden" label="Hide this link" @update:model-value="patch({ hidden: $event || undefined })" />
    </div>
    <p v-if="err('identity')" :id="fieldId(k('identity'))" class="field-error">{{ err('identity') }}</p>
    <p v-if="screen" class="link-screen"><UiBadge :tone="screen.tone">{{ screen.text }}</UiBadge></p>
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
.link-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.link-fields legend {
  padding: 0 var(--space-2xs);
  font-weight: var(--font-weight-semibold);
}

.link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
}

.link-flags,
.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
}

.link-screen,
.field-error {
  margin: 0;
}

.field-error {
  padding-inline-start: var(--space-xs);
  border-inline-start: 4px solid var(--danger);
  font-weight: var(--font-weight-semibold);
}
</style>
