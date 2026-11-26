<script setup lang="ts">
// source (the hosted service or the loopback editor backend, src/editor/source.ts), with the service's issues shown next to the fields
// they name and listed at the top, and the page rendered in a sandboxed frame beside it. The editor never decides whether a document
// is valid: the service's parser does, and the form shows what it says.
// Vue's reactivity and lifecycle.
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
// The shared button, file field, live status, notice, select and text field.
import { UiButton, UiFileField, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
// The API error (which may carry issues), the words for a failure and the issue type.
import { ApiError, describeError, type Issue } from '../api/errors.js'
// The service's limits and link screening.
import type { Limits, Screening } from '../api/types.js'
// The list of problems at the top of the form.
import IssueSummary from '../components/IssueSummary.vue'
// The sandboxed preview.
import PreviewFrame from '../components/PreviewFrame.vue'
// A group's fields.
import GroupFields from './GroupFields.vue'
// A link's fields.
import LinkFields from './LinkFields.vue'
// Provide the shared context to the pieces.
import { provideEditor } from './context.js'
import {
  SCHEMA_1_THEME,
  THEME_KEYS,
  addGroup,
  addLink,
  errorFor,
  fieldId,
  groupCount,
  linkCount,
  locate,
  moveItem,
  normalise,
  placeIssues,
  removeItem,
  toDocument,
  type PageDoc,
  type PlacedIssues,
  type ThemeKey,
  type ThemeOptions,
} from './model.js'
import type { EditorSource, Loaded, Preview } from './source.js'

// The source of the document, and the link screening (the hosted page's).
const props = withDefaults(defineProps<{ source: EditorSource; screening?: Screening[] }>(), { screening: () => [] })
// Tell the parent when a document has loaded or been saved.
const emit = defineEmits<{ loaded: [Loaded]; saved: [] }>()

// The document being edited, reactive so the form edits it in place.
const doc = reactive<PageDoc>(normalise({}))
// True once the document has loaded.
const ready = ref(false)
// A failed load, in words.
const loadError = ref('')
// The service's bounds, for the fields' limits.
const limits = shallowRef<Limits | null>(null)
// The theme options (schema 1's until the source gives its own).
const themeOptions = shallowRef<ThemeOptions>(SCHEMA_1_THEME)
// The issues from a refused save, placed on their fields.
const placed = ref<PlacedIssues | null>(null)
// The parser's notes about the stored document.
const notes = ref<Issue[]>([])
// What the service changed or removed on a save.
const warnings = ref<Issue[]>([])
// A failure that is not about the document, in words.
const problem = ref('')
// A polite announcement of what just happened.
const status = ref('')
// True while a save is in flight.
const saving = ref(false)
// True when the form differs from what was loaded or saved.
const dirty = ref(false)
// The picture's address, when the source gave one.
const avatarUrl = ref<string | null>(null)
// A failed upload, in words.
const avatarError = ref<string | null>(null)
// True while a picture uploads.
const uploading = ref(false)
// What the preview frame shows.
const preview = ref<Preview | null>(null)
// Why there is no preview, in words.
const previewProblem = ref('')
// Counts saves so the preview frame loads the saved draft again.
const generation = ref(0)
// The issue summary, so focus can move to it after a refused save.
const summary = ref<InstanceType<typeof IssueSummary> | null>(null)
// The screening, as a ref the context can share.
const screening = computed(() => props.screening)

/** Replace the document's contents in place (the reactive object keeps its identity). */
function replaceDoc(next: PageDoc): void {
  for (const k of Object.keys(doc)) delete (doc as Record<string, unknown>)[k]
  Object.assign(doc, next)
}

/** Ask the source for the preview of the document as it stands. */
async function refreshPreview(): Promise<void> {
  previewProblem.value = ''
  try {
    // The hosted source renders the saved draft; the local one renders the form's document.
    preview.value = await props.source.preview(toDocument(doc), generation.value)
  } catch (e) {
    preview.value = null
    previewProblem.value =
      e instanceof ApiError && e.issues.length ? 'The preview shows once the page has no problems.' : `The preview could not be shown: ${describeError(e)}`
  }
}

/** Load the document, the limits and the theme options together. */
async function load(): Promise<void> {
  loadError.value = ''
  try {
    const [loaded, l, t] = await Promise.all([props.source.load(), props.source.limits(), props.source.themeOptions()])
    // Show the loaded document.
    replaceDoc(loaded.doc)
    limits.value = l
    themeOptions.value = t
    notes.value = loaded.issues
    placed.value = null
    ready.value = true
    // Wait for the form to settle, so loading is not counted as an edit.
    await nextTick()
    // Nothing has been edited yet.
    dirty.value = false
    emit('loaded', loaded)
    await refreshPreview()
  } catch (e) {
    loadError.value = describeError(e)
  }
}
// Load when the editor opens.
onMounted(load)
// Any change to the document marks the form as edited.
watch(doc, () => (dirty.value = true), { deep: true })

/** Whether a field with this key is on the form, so the summary can link to it. */
function known(key: string): boolean {
  return typeof document !== 'undefined' && !!document.getElementById(fieldId(key))
}

/** Save the document; the service's parser decides whether it is valid. */
async function save(): Promise<void> {
  // One save at a time.
  if (saving.value) return
  saving.value = true
  problem.value = ''
  status.value = 'Saving…'
  // The issues name positions in the document as sent; place them against that, so they stay on the right links if the person
  // moves one while the save is under way.
  // The issues name positions in the document as sent, so they are placed against a copy of it.
  const sent = normalise(JSON.parse(JSON.stringify(toDocument(doc))))
  try {
    // Send the document; the source resolves with warnings or rejects with issues.
    const r = await props.source.save(toDocument(doc))
    placed.value = null
    warnings.value = r.warnings
    notes.value = []
    dirty.value = false
    status.value = r.warnings.length ? 'Saved, with notes below.' : 'Saved.'
    // The preview must load the saved draft again.
    generation.value++
    emit('saved')
    await refreshPreview()
  } catch (e) {
    status.value = ''
    if (e instanceof ApiError && e.issues.length) {
      // A refused document: place each issue on its field and move focus to the summary.
      placed.value = placeIssues(sent, e.issues)
      await nextTick()
      summary.value?.focus()
    } else {
      // Any other failure.
      problem.value = describeError(e)
    }
  } finally {
    saving.value = false
  }
}

/** After a move, put focus back on the button that moved the item (or its twin, when that one is now disabled). */
function focusMoved(id: string, delta: -1 | 1): void {
  void nextTick(() => {
    const first = document.getElementById(`${delta < 0 ? 'up' : 'down'}-${id}`) as HTMLButtonElement | null
    const other = document.getElementById(`${delta < 0 ? 'down' : 'up'}-${id}`) as HTMLButtonElement | null
    ;(first && !first.disabled ? first : other)?.focus()
  })
}

/** An item's name for the announcements. */
function itemName(id: string): string {
  const at = locate(doc, id)
  const item = at?.list[at.index]
  return item?.title.trim() || (item?.kind === 'group' ? 'Untitled group' : 'Untitled link')
}

// Share the document and the operations with the link and group pieces.
provideEditor({
  doc,
  limits,
  placed,
  screening,
  // Move an item, announce where it went and keep focus on it.
  move(id, delta) {
    const to = moveItem(doc, id, delta)
    if (to === null) return
    const at = locate(doc, id)
    status.value = `Moved “${itemName(id)}” ${delta < 0 ? 'up' : 'down'}: now ${to + 1} of ${at?.list.length ?? 0}.`
    focusMoved(id, delta)
  },
  // Remove an item and announce it.
  remove(id) {
    const name = itemName(id)
    if (removeItem(doc, id)) status.value = `Removed “${name}”.`
  },
  // Add a link and put focus on its title.
  addLink(groupId) {
    const l = addLink(doc, groupId)
    status.value = 'Added a link.'
    void nextTick(() => document.getElementById(fieldId(`item:${l.id}/title`))?.focus())
  },
})

/** Add a group and put focus on its title. */
function newGroup(): void {
  const g = addGroup(doc)
  status.value = 'Added a group.'
  void nextTick(() => document.getElementById(fieldId(`item:${g.id}/title`))?.focus())
}

/** Add a link and put focus on its title. */
function newLink(): void {
  const l = addLink(doc)
  status.value = 'Added a link.'
  void nextTick(() => document.getElementById(fieldId(`item:${l.id}/title`))?.focus())
}

/** Upload a chosen picture and set it as the page's picture (it takes effect when saved). */
async function choosePicture(file: File | null): Promise<void> {
  avatarError.value = null
  if (!file) return
  uploading.value = true
  try {
    const r = await props.source.uploadAvatar(file)
    doc.identity.avatar = r.avatar
    avatarUrl.value = r.url
    status.value = 'Picture uploaded. Save to use it.'
  } catch (e) {
    avatarError.value = describeError(e)
  } finally {
    uploading.value = false
  }
}

/** Remove the picture (it takes effect when saved). */
function removePicture(): void {
  delete doc.identity.avatar
  avatarUrl.value = null
  status.value = 'Picture removed. Save to keep the change.'
}

// The error for a field key.
const err = (key: string) => errorFor(placed.value, key)
// The look's choices, in words.
const themeLabels: Record<ThemeKey, string> = {
  colorMode: 'Colour mode',
  season: 'Season',
  accent: 'Accent colour',
  buttons: 'Buttons',
  radius: 'Corner rounding',
  density: 'Spacing',
  layout: 'Layout',
  font: 'Typeface',
}
// Words for the option values that need them; others are capitalised.
const OPTION_WORDS: Record<string, string> = {
  system: 'Follow the visitor’s setting',
  none: 'None',
  season: 'The season’s colour',
  xs: 'Extra small',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
  sans: 'Sans-serif',
}
// An option value as words.
const words = (k: ThemeKey, v: string) => (k === 'accent' && v === 'season' ? OPTION_WORDS.season! : (OPTION_WORDS[v] ?? v[0]!.toUpperCase() + v.slice(1)))
// The options for one theme key.
const themeChoices = (k: ThemeKey) => (themeOptions.value[k] ?? []).map((v) => [v, words(k, v)] as const)
// Issues about the theme as a whole or any of its keys.
const themeErrors = computed(() => [err('theme'), ...THEME_KEYS.map((k) => err(`theme/${k}`))].filter(Boolean).join(' '))

// Whether the page is for a person or an organisation.
const kindOptions = [
  ['person', 'A person'],
  ['organization', 'An organisation'],
] as const

// A contact's address without its `mailto:` prefix, for the form.
const email = (url: string) => url.replace(/^mailto:/i, '')
/** Store a typed address as a `mailto:` address (empty stays empty). */
function setEmail(i: number, v: string): void {
  const c = doc.contact[i]
  if (c) c.url = v.trim() ? `mailto:${v.trim().replace(/^mailto:/i, '')}` : ''
}
/** Add an empty contact and put focus on its label. */
function addContact(): void {
  doc.contact.push({ label: '', url: '' })
  const i = doc.contact.length - 1
  void nextTick(() => document.getElementById(fieldId(`contact/${i}/label`))?.focus())
}
/** Remove a contact and announce it. */
function removeContact(i: number): void {
  doc.contact.splice(i, 1)
  status.value = 'Removed a contact.'
}

// How many links and groups the page has, against the limits.
const counts = computed(() => {
  const l = limits.value
  return `${linkCount(doc)} of ${l?.links ?? '…'} links, ${groupCount(doc)} of ${l?.groups ?? '…'} groups`
})
// Let the parent reload or save the editor.
defineExpose({ reload: load, save })
</script>

<template>
  <div class="page-editor">
    <!-- A failed load. -->
    <UiNotice v-if="loadError" type="error" :message="`The page could not be loaded: ${loadError}`" />
    <!-- Loading. -->
    <UiLiveStatus v-if="!ready && !loadError" label="Loading the page" message="Loading the page…" />

    <!-- The form and the preview side by side. -->
    <div v-if="ready" class="editor-layout">
      <!-- The form: the browser's own validation is off, because the service's parser decides what is valid. -->
      <form class="editor-form" novalidate @submit.prevent="save">
        <!-- The problems from a refused save, linked to their fields. -->
        <IssueSummary v-if="placed?.all.length" ref="summary" :issues="placed.all" :known="known" />
        <!-- A failure that is not about the document. -->
        <UiNotice v-if="problem" type="error" :message="problem" />
        <!-- The parser's notes about the stored document. -->
        <template v-if="notes.length">
          <UiNotice type="info" message="The saved page has these notes:" />
          <ul class="notes">
            <li v-for="(n, i) in notes" :key="i">{{ n.message }}</li>
            </ul>
        </template>

        <!-- About you. -->
        <fieldset class="editor-section">
          <!-- The identity section's legend. -->
          <legend><h3>About you</h3></legend>
          <!-- Name, handle, kind and pronouns. -->
          <div class="field-grid">
            <UiTextField
              :id="fieldId('identity/displayName')"
              v-model="doc.identity.displayName"
              label="Name"
              :error="err('identity/displayName')"
              :maxlength="limits?.displayName"
              autocomplete="name"
            />
            <UiTextField
              v-if="source.handleEditable"
              :id="fieldId('identity/handle')"
              v-model="doc.identity.handle"
              label="Handle"
              hint="lowercase letters, digits and hyphens"
              :error="err('identity/handle')"
              :maxlength="limits?.handle"
            />
            <!-- On the hosted service the handle is the account's, so it is shown, not edited. -->
            <p v-else :id="fieldId('identity/handle')" class="handle-line">
              Handle <strong>{{ doc.identity.handle }}</strong>
              <span v-if="err('identity/handle')" class="field-error">{{ err('identity/handle') }}</span>
            </p>
            <UiSelectField
              :id="fieldId('identity/kind')"
              :model-value="doc.identity.kind ?? 'person'"
              label="This page is for"
              :options="kindOptions"
              :error="err('identity/kind')"
              @update:model-value="doc.identity.kind = $event === 'organization' ? 'organization' : undefined"
            />
            <UiTextField
              :id="fieldId('identity/pronouns')"
              :model-value="doc.identity.pronouns ?? ''"
              label="Pronouns (optional)"
              :error="err('identity/pronouns')"
              :maxlength="limits?.pronouns"
              @update:model-value="doc.identity.pronouns = $event"
            />
          </div>
          <UiTextField
            :id="fieldId('identity/bio')"
            :model-value="doc.identity.bio ?? ''"
            label="About (optional)"
            :rows="3"
            :hint="limits ? `at most ${limits.bio} characters` : undefined"
            :error="err('identity/bio')"
            :maxlength="limits?.bio"
            @update:model-value="doc.identity.bio = $event"
          />
          <!-- The picture and its controls. -->
          <div class="picture">
            <!-- The picture, when there is an address to show. -->
            <img v-if="avatarUrl" :src="avatarUrl" alt="Your picture" class="picture-img" width="96" height="96" />
            <UiFileField
              :id="fieldId('identity/avatar')"
              label="Picture"
              accept="image/png,image/jpeg,image/webp,image/gif"
              :hint="doc.identity.avatar ? 'a picture is set; choose another to replace it' : 'PNG, JPEG, WebP or GIF; it is resized to at most 400 × 400'"
              :error="avatarError ?? err('identity/avatar')"
              :disabled="uploading"
              @select="choosePicture"
            />
            <UiButton v-if="doc.identity.avatar" variant="ghost" size="sm" @click="removePicture">Remove the picture</UiButton>
          </div>
        </fieldset>

        <!-- The links. -->
        <fieldset :id="fieldId('items')" class="editor-section">
          <!-- The links section's legend. -->
          <legend><h3>Links</h3></legend>
          <p class="section-hint">{{ counts }}. Move links with the buttons under each one.</p>
          <p v-if="err('items')" class="field-error">{{ err('items') }}</p>
          <!-- Each item is a group or a link. -->
          <ol v-if="doc.items.length" class="item-list">
            <!-- A group or a link. -->
            <li v-for="item in doc.items" :key="item.id">
              <GroupFields v-if="item.kind === 'group'" :id="item.id" />
              <LinkFields v-else :id="item.id" />
            </li>
          </ol>
          <p v-else>No links yet.</p>
          <!-- Add a link or a group. -->
          <p class="section-actions">
            <UiButton variant="secondary" @click="newLink">Add a link</UiButton>
            <UiButton variant="secondary" @click="newGroup">Add a group</UiButton>
          </p>
        </fieldset>

        <!-- The look. -->
        <fieldset :id="fieldId('theme')" class="editor-section">
          <!-- The look section's legend. -->
          <legend><h3>Look</h3></legend>
          <p v-if="themeErrors" class="field-error">{{ themeErrors }}</p>
          <div class="field-grid">
            <UiSelectField
              v-for="k in THEME_KEYS"
              :id="fieldId(`theme/${k}`)"
              :key="k"
              :model-value="doc.theme[k] ?? ''"
              :label="themeLabels[k]"
              placeholder="Default"
              :options="themeChoices(k)"
              @update:model-value="doc.theme[k] = $event || undefined"
            />
          </div>
        </fieldset>

        <!-- Contact addresses. -->
        <fieldset :id="fieldId('contact')" class="editor-section">
          <legend><h3>Contact</h3></legend>
          <p class="section-hint">Email addresses visitors can write to (at most {{ limits?.contacts ?? 4 }}).</p>
          <p v-if="err('contact')" class="field-error">{{ err('contact') }}</p>
          <!-- The contacts, one row each. -->
          <ol v-if="doc.contact.length" class="item-list">
            <!-- One row per contact: a label and an email address. -->
            <li v-for="(c, i) in doc.contact" :key="i" class="contact-row">
              <UiTextField :id="fieldId(`contact/${i}/label`)" v-model="c.label" :label="`Label ${i + 1}`" :error="err(`contact/${i}/label`)" :maxlength="limits?.label" />
              <UiTextField
                :id="fieldId(`contact/${i}/url`)"
                :model-value="email(c.url)"
                :label="`Email address ${i + 1}`"
                type="email"
                autocomplete="email"
                :error="err(`contact/${i}/url`)"
                @update:model-value="setEmail(i, $event)"
              />
              <!-- Remove this contact; the button names it for assistive technology. -->
              <UiButton class="row-remove" variant="ghost" size="sm" @click="removeContact(i)">Remove<span class="mw-visually-hidden"> (contact {{ i + 1 }})</span></UiButton>
            </li>
          </ol>
          <p class="section-actions">
            <UiButton variant="secondary" :disabled="doc.contact.length >= (limits?.contacts ?? 4)" @click="addContact">Add a contact</UiButton>
          </p>
        </fieldset>

        <!-- What the service changed on the last save. -->
        <template v-if="warnings.length">

          <UiNotice type="info" message="Saved. The service removed or changed these parts:" />

          <ul class="notes">
            <li v-for="(w, i) in warnings" :key="i">{{ w.message }}</li>
            </ul>

        </template>
        <!-- Save, and whether there are unsaved changes. -->
        <p class="save-row">
          <UiButton type="submit" :busy="saving">Save</UiButton>
          <span v-if="dirty" class="unsaved">Unsaved changes</span>
        </p>
        <!-- Announces what just happened. -->
        <UiLiveStatus label="Editor" :message="status" />
      </form>

      <!-- The preview, sticky beside the form. -->
      <section class="editor-preview" aria-labelledby="preview-title">
        <h3 id="preview-title">Preview</h3>
        <p class="section-hint">{{ source.kind === 'hosted' ? 'The saved draft, as visitors will see it once published.' : 'The page as it is in the form, before saving.' }}</p>
        <UiNotice v-if="previewProblem" type="info" :message="previewProblem" />
        <!-- The sandboxed frame. -->
        <PreviewFrame :preview="preview" />
        <!-- The local editor's preview is of the unsaved form, so it can be refreshed by hand. -->
        <p v-if="source.kind === 'local'"><UiButton variant="secondary" size="sm" @click="refreshPreview">Refresh the preview</UiButton></p>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.page-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* Two columns, form and preview. */
.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--space-lg);
  align-items: start;
}

/* One column on a narrow screen. */
@media (width <= 60em) {
  .editor-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* The form is a column with a large gap. */
.editor-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  min-inline-size: 0;
}

/* Each section is a column. */
.editor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The legend's heading has no top margin. */
.editor-section legend h3 {
  margin: 0 0 var(--space-xs);
}

/* As many columns as fit. */
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
}

/* A plain column of items. */
.item-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A contact's fields and its remove button in a row. */
.contact-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
  align-items: end;
}

/* The remove button lines up with the fields. */
.row-remove {
  justify-self: start;
  margin-block-end: var(--space-xs);
}

/* The picture and its field in a row. */
.picture {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* A rounded picture. */
.picture-img {
  border-radius: var(--radius);
}

/* A muted hint. */
.section-hint {
  margin: 0;
  color: var(--muted);
}

/* The buttons wrap. */
.section-actions,
.save-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
  margin: 0;
}

/* The handle as a small column. */
.handle-line {
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
  margin: 0;
}

/* A muted note. */
.unsaved {
  color: var(--muted);
}

/* An indented list. */
.notes {
  margin: 0;
  padding-inline-start: var(--space-lg);
}

/* An issue is marked with a red rule and bold text, so it is not carried by colour alone. */
.field-error {
  margin: 0;
  padding-inline-start: var(--space-xs);
  border-inline-start: 4px solid var(--danger);
  font-weight: var(--font-weight-semibold);
}

/* The preview stays in view below the header while the form scrolls. */
.editor-preview {
  position: sticky;
  inset-block-start: calc(var(--mw-header-height) + var(--space-sm));
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-inline-size: 0;
}

/* No default margins. */
.editor-preview h3,
.editor-preview p {
  margin: 0;
}
</style>
