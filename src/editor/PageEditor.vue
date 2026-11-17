<script setup lang="ts">
// The page editor: a form over the page document (who you are, links and groups, the look, contact), saved through the injected
// source (the hosted service or the loopback editor backend, src/editor/source.ts), with the service's issues shown next to the fields
// they name and listed at the top, and the page rendered in a sandboxed frame beside it. The editor never decides whether a document
// is valid: the service's parser does, and the form shows what it says.
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { UiButton, UiFileField, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
import { ApiError, describeError, type Issue } from '../api/errors.js'
import type { Limits, Screening } from '../api/types.js'
import IssueSummary from '../components/IssueSummary.vue'
import PreviewFrame from '../components/PreviewFrame.vue'
import GroupFields from './GroupFields.vue'
import LinkFields from './LinkFields.vue'
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

const props = withDefaults(defineProps<{ source: EditorSource; screening?: Screening[] }>(), { screening: () => [] })
const emit = defineEmits<{ loaded: [Loaded]; saved: [] }>()

const doc = reactive<PageDoc>(normalise({}))
const ready = ref(false)
const loadError = ref('')
const limits = shallowRef<Limits | null>(null)
const themeOptions = shallowRef<ThemeOptions>(SCHEMA_1_THEME)
const placed = ref<PlacedIssues | null>(null)
const notes = ref<Issue[]>([])
const warnings = ref<Issue[]>([])
const problem = ref('')
const status = ref('')
const saving = ref(false)
const dirty = ref(false)
const avatarUrl = ref<string | null>(null)
const avatarError = ref<string | null>(null)
const uploading = ref(false)
const preview = ref<Preview | null>(null)
const previewProblem = ref('')
const generation = ref(0)
const summary = ref<InstanceType<typeof IssueSummary> | null>(null)
const screening = computed(() => props.screening)

function replaceDoc(next: PageDoc): void {
  for (const k of Object.keys(doc)) delete (doc as Record<string, unknown>)[k]
  Object.assign(doc, next)
}

async function refreshPreview(): Promise<void> {
  previewProblem.value = ''
  try {
    preview.value = await props.source.preview(toDocument(doc), generation.value)
  } catch (e) {
    preview.value = null
    previewProblem.value =
      e instanceof ApiError && e.issues.length ? 'The preview shows once the page has no problems.' : `The preview could not be shown: ${describeError(e)}`
  }
}

async function load(): Promise<void> {
  loadError.value = ''
  try {
    const [loaded, l, t] = await Promise.all([props.source.load(), props.source.limits(), props.source.themeOptions()])
    replaceDoc(loaded.doc)
    limits.value = l
    themeOptions.value = t
    notes.value = loaded.issues
    placed.value = null
    ready.value = true
    await nextTick()
    dirty.value = false
    emit('loaded', loaded)
    await refreshPreview()
  } catch (e) {
    loadError.value = describeError(e)
  }
}
onMounted(load)
watch(doc, () => (dirty.value = true), { deep: true })

/** Whether a field with this key is on the form, so the summary can link to it. */
function known(key: string): boolean {
  return typeof document !== 'undefined' && !!document.getElementById(fieldId(key))
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  problem.value = ''
  status.value = 'Saving…'
  // The issues name positions in the document as sent; place them against that, so they stay on the right links if the person
  // moves one while the save is under way.
  const sent = normalise(JSON.parse(JSON.stringify(toDocument(doc))))
  try {
    const r = await props.source.save(toDocument(doc))
    placed.value = null
    warnings.value = r.warnings
    notes.value = []
    dirty.value = false
    status.value = r.warnings.length ? 'Saved, with notes below.' : 'Saved.'
    generation.value++
    emit('saved')
    await refreshPreview()
  } catch (e) {
    status.value = ''
    if (e instanceof ApiError && e.issues.length) {
      placed.value = placeIssues(sent, e.issues)
      await nextTick()
      summary.value?.focus()
    } else {
      problem.value = describeError(e)
    }
  } finally {
    saving.value = false
  }
}

function focusMoved(id: string, delta: -1 | 1): void {
  void nextTick(() => {
    const first = document.getElementById(`${delta < 0 ? 'up' : 'down'}-${id}`) as HTMLButtonElement | null
    const other = document.getElementById(`${delta < 0 ? 'down' : 'up'}-${id}`) as HTMLButtonElement | null
    ;(first && !first.disabled ? first : other)?.focus()
  })
}

function itemName(id: string): string {
  const at = locate(doc, id)
  const item = at?.list[at.index]
  return item?.title.trim() || (item?.kind === 'group' ? 'Untitled group' : 'Untitled link')
}

provideEditor({
  doc,
  limits,
  placed,
  screening,
  move(id, delta) {
    const to = moveItem(doc, id, delta)
    if (to === null) return
    const at = locate(doc, id)
    status.value = `Moved “${itemName(id)}” ${delta < 0 ? 'up' : 'down'}: now ${to + 1} of ${at?.list.length ?? 0}.`
    focusMoved(id, delta)
  },
  remove(id) {
    const name = itemName(id)
    if (removeItem(doc, id)) status.value = `Removed “${name}”.`
  },
  addLink(groupId) {
    const l = addLink(doc, groupId)
    status.value = 'Added a link.'
    void nextTick(() => document.getElementById(fieldId(`item:${l.id}/title`))?.focus())
  },
})

function newGroup(): void {
  const g = addGroup(doc)
  status.value = 'Added a group.'
  void nextTick(() => document.getElementById(fieldId(`item:${g.id}/title`))?.focus())
}

function newLink(): void {
  const l = addLink(doc)
  status.value = 'Added a link.'
  void nextTick(() => document.getElementById(fieldId(`item:${l.id}/title`))?.focus())
}

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

function removePicture(): void {
  delete doc.identity.avatar
  avatarUrl.value = null
  status.value = 'Picture removed. Save to keep the change.'
}

const err = (key: string) => errorFor(placed.value, key)
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
const words = (k: ThemeKey, v: string) => (k === 'accent' && v === 'season' ? OPTION_WORDS.season! : (OPTION_WORDS[v] ?? v[0]!.toUpperCase() + v.slice(1)))
const themeChoices = (k: ThemeKey) => (themeOptions.value[k] ?? []).map((v) => [v, words(k, v)] as const)
const themeErrors = computed(() => [err('theme'), ...THEME_KEYS.map((k) => err(`theme/${k}`))].filter(Boolean).join(' '))

const kindOptions = [
  ['person', 'A person'],
  ['organization', 'An organisation'],
] as const

const email = (url: string) => url.replace(/^mailto:/i, '')
function setEmail(i: number, v: string): void {
  const c = doc.contact[i]
  if (c) c.url = v.trim() ? `mailto:${v.trim().replace(/^mailto:/i, '')}` : ''
}
function addContact(): void {
  doc.contact.push({ label: '', url: '' })
  const i = doc.contact.length - 1
  void nextTick(() => document.getElementById(fieldId(`contact/${i}/label`))?.focus())
}
function removeContact(i: number): void {
  doc.contact.splice(i, 1)
  status.value = 'Removed a contact.'
}

const counts = computed(() => {
  const l = limits.value
  return `${linkCount(doc)} of ${l?.links ?? '…'} links, ${groupCount(doc)} of ${l?.groups ?? '…'} groups`
})
defineExpose({ reload: load, save })
</script>

<template>
  <div class="page-editor">
    <UiNotice v-if="loadError" type="error" :message="`The page could not be loaded: ${loadError}`" />
    <UiLiveStatus v-if="!ready && !loadError" label="Loading the page" message="Loading the page…" />

    <div v-if="ready" class="editor-layout">
      <form class="editor-form" novalidate @submit.prevent="save">
        <IssueSummary v-if="placed?.all.length" ref="summary" :issues="placed.all" :known="known" />
        <UiNotice v-if="problem" type="error" :message="problem" />
        <template v-if="notes.length">
          <UiNotice type="info" message="The saved page has these notes:" />
          <ul class="notes">
            <li v-for="(n, i) in notes" :key="i">{{ n.message }}</li>
            </ul>
        </template>

        <fieldset class="editor-section">
          <legend><h3>About you</h3></legend>
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
          <div class="picture">
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

        <fieldset :id="fieldId('items')" class="editor-section">
          <legend><h3>Links</h3></legend>
          <p class="section-hint">{{ counts }}. Move links with the buttons under each one.</p>
          <p v-if="err('items')" class="field-error">{{ err('items') }}</p>
          <ol v-if="doc.items.length" class="item-list">
            <li v-for="item in doc.items" :key="item.id">
              <GroupFields v-if="item.kind === 'group'" :id="item.id" />
              <LinkFields v-else :id="item.id" />
            </li>
          </ol>
          <p v-else>No links yet.</p>
          <p class="section-actions">
            <UiButton variant="secondary" @click="newLink">Add a link</UiButton>
            <UiButton variant="secondary" @click="newGroup">Add a group</UiButton>
          </p>
        </fieldset>

        <fieldset :id="fieldId('theme')" class="editor-section">
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

        <fieldset :id="fieldId('contact')" class="editor-section">
          <legend><h3>Contact</h3></legend>
          <p class="section-hint">Email addresses visitors can write to (at most {{ limits?.contacts ?? 4 }}).</p>
          <p v-if="err('contact')" class="field-error">{{ err('contact') }}</p>
          <ol v-if="doc.contact.length" class="item-list">
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
              <UiButton class="row-remove" variant="ghost" size="sm" @click="removeContact(i)">Remove<span class="mw-visually-hidden"> (contact {{ i + 1 }})</span></UiButton>
            </li>
          </ol>
          <p class="section-actions">
            <UiButton variant="secondary" :disabled="doc.contact.length >= (limits?.contacts ?? 4)" @click="addContact">Add a contact</UiButton>
          </p>
        </fieldset>

        <template v-if="warnings.length">

          <UiNotice type="info" message="Saved. The service removed or changed these parts:" />

          <ul class="notes">
            <li v-for="(w, i) in warnings" :key="i">{{ w.message }}</li>
            </ul>

        </template>
        <p class="save-row">
          <UiButton type="submit" :busy="saving">Save</UiButton>
          <span v-if="dirty" class="unsaved">Unsaved changes</span>
        </p>
        <UiLiveStatus label="Editor" :message="status" />
      </form>

      <section class="editor-preview" aria-labelledby="preview-title">
        <h3 id="preview-title">Preview</h3>
        <p class="section-hint">{{ source.kind === 'hosted' ? 'The saved draft, as visitors will see it once published.' : 'The page as it is in the form, before saving.' }}</p>
        <UiNotice v-if="previewProblem" type="info" :message="previewProblem" />
        <PreviewFrame :preview="preview" />
        <p v-if="source.kind === 'local'"><UiButton variant="secondary" size="sm" @click="refreshPreview">Refresh the preview</UiButton></p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--space-lg);
  align-items: start;
}

@media (width <= 60em) {
  .editor-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  min-inline-size: 0;
}

.editor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.editor-section legend h3 {
  margin: 0 0 var(--space-xs);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.contact-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-xs) var(--space-sm);
  align-items: end;
}

.row-remove {
  justify-self: start;
  margin-block-end: var(--space-xs);
}

.picture {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.picture-img {
  border-radius: var(--radius);
}

.section-hint {
  margin: 0;
  color: var(--muted);
}

.section-actions,
.save-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
  margin: 0;
}

.handle-line {
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
  margin: 0;
}

.unsaved {
  color: var(--muted);
}

.notes {
  margin: 0;
  padding-inline-start: var(--space-lg);
}

.field-error {
  margin: 0;
  padding-inline-start: var(--space-xs);
  border-inline-start: 4px solid var(--danger);
  font-weight: var(--font-weight-semibold);
}

.editor-preview {
  position: sticky;
  inset-block-start: calc(var(--mw-header-height) + var(--space-sm));
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.editor-preview h3,
.editor-preview p {
  margin: 0;
}
</style>
