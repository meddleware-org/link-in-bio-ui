<script setup lang="ts">
// The signed-in account's page: whether it is published, publishing and taking it offline, the editor over the draft, the links'
// screening, and the published versions (any can be copied back into the draft).
// Vue's reactivity and lifecycle.
import { computed, onMounted, ref, shallowRef } from 'vue'
// The shared badge, button, table, live status and notice.
import { UiBadge, UiButton, UiDataTable, UiLiveStatus, UiNotice } from '@meddleware/ui'
// Accepts only addresses that are safe to link.
import { safeHref } from '@meddleware/web-utils'
// The API error (to tell a payment problem) and the words for a failure.
import { ApiError, describeError } from '../../api/errors.js'
// The page's state and a published version.
import type { PageState, Published } from '../../api/types.js'
// The page editor.
import PageEditor from '../../editor/PageEditor.vue'
// The hosted service as the editor's source.
import { hostedSource, type Loaded } from '../../editor/source.js'
// The app context.
import { useApp } from '../../context.js'
// A date and time for people.
import { when } from '../../lib/format.js'

// Ask the area to open another tab (billing).
const emit = defineEmits<{ navigate: [tab: string] }>()
// The typed API, the HTTP layer and who is signed in.
const { api, http, me } = useApp()
// The hosted source.
const source = hostedSource(http)

// The page's state as the service last reported it.
const page = shallowRef<PageState | null>(null)
// The published versions.
const versions = ref<Array<{ version: number; at: string }>>([])
// The result of the last publish.
const published = shallowRef<Published | null>(null)
// Which action is in flight.
const busy = ref('')
// A failure, in words.
const problem = ref('')
// True when publishing was refused because the account is not paid.
const needsPayment = ref(false)
// A polite announcement of what just happened.
const status = ref('')
// Changing it remounts the editor, so a restored version shows.
const editorKey = ref(0)

/** Read the page and its versions again. */
async function refresh(): Promise<void> {
  try {
    page.value = await api.page()
    versions.value = (await api.versions()).versions
  } catch (e) {
    problem.value = describeError(e)
  }
}

/** Take the page's state from the editor's load. */
function loaded(l: Loaded): void {
  if (l.page) page.value = l.page
}

// Read the versions once; the editor loads the page.
onMounted(async () => {
  try {
    versions.value = (await api.versions()).versions
  } catch (e) {
    problem.value = describeError(e)
  }
})

/** Run one action: one at a time, a failure said in words, and a refused publish pointing to billing. */
async function act(name: string, f: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = name
  problem.value = ''
  needsPayment.value = false
  try {
    await f()
  } catch (e) {
    problem.value = describeError(e)
    // A 409 for an account that is not entitled means payment is needed.
    needsPayment.value = e instanceof ApiError && e.status === 409 && !me.value?.entitled
  } finally {
    busy.value = ''
  }
}

// Publish the draft.
const publish = () =>
  act('publish', async () => {
    published.value = await api.publish()
    status.value = `Published version ${published.value.version}.`
    await refresh()
  })

// Take the page offline.
const unpublish = () =>
  act('unpublish', async () => {
    await api.unpublish()
    published.value = null
    status.value = 'Your page is offline.'
    await refresh()
  })

// Copy a published version back into the draft, and reload the editor.
const restore = (v: number) =>
  act(`restore-${v}`, async () => {
    await api.restore(v)
    status.value = `Version ${v} is now the draft.`
    editorKey.value++
    await refresh()
  })

// The page's address, only when it is safe to link.
const pageLink = computed(() => safeHref(page.value?.url))
</script>

<template>
  <div class="page-view">
    <!-- The view's heading. -->
    <h2>Your page</h2>

    <!-- Publishing status and actions. -->
    <section class="page-status" aria-labelledby="page-status-title">
      <!-- A heading for assistive technology only. -->
      <h3 id="page-status-title" class="mw-visually-hidden">Publishing</h3>
      <!-- Whether the page is published, which version, and where. -->
      <p v-if="page" class="status-line">
        <UiBadge :tone="page.published ? 'ok' : 'neutral'">{{ page.published ? 'Published' : 'Not published' }}</UiBadge>
        <template v-if="page.published">
          version {{ page.version }}, {{ when(page.publishedAt) }}
          <template v-if="page.changed"> · the draft has changes that are not published</template>
        </template>
        <template v-if="pageLink"> · <a :href="pageLink">{{ page.url }}</a></template>
      </p>
      <!-- Publish, or take the page offline. -->
      <p class="status-actions">
        <UiButton :busy="busy === 'publish'" @click="publish">{{ page?.published ? 'Publish the draft' : 'Publish' }}</UiButton>
        <UiButton v-if="page?.published" variant="secondary" :busy="busy === 'unpublish'" @click="unpublish">Take the page offline</UiButton>
      </p>
      <!-- A failure, in words. -->
      <UiNotice v-if="problem" type="error" :message="problem" />
      <!-- A way to billing when payment is what is missing. -->
      <p v-if="needsPayment"><UiButton variant="secondary" @click="emit('navigate', 'billing')">Go to billing</UiButton></p>
      <!-- Published but not served yet. -->
      <UiNotice v-if="published && !published.online" type="info" message="Your page is published. Pages from accounts like yours are not served on this service yet; it goes online as soon as they are." />
      <!-- Links held back by screening. -->
      <template v-if="published?.hidden.length">
        <UiNotice type="warning" message="These links were flagged as unsafe and are hidden until a person decides:" />
        <ul class="notes">
          <li v-for="h in published.hidden" :key="h.url"><code>{{ h.url }}</code></li>
          </ul>
      </template>
      <!-- Announces what just happened. -->
      <UiLiveStatus label="Publishing" :message="status" />
    </section>

    <!-- The editor over the draft; it reports its load and each save. -->
    <PageEditor :key="editorKey" :source="source" :screening="page?.screening ?? []" @loaded="loaded" @saved="refresh" />

    <!-- The published versions. -->
    <div class="versions">
      <h3 id="versions-title">Published versions</h3>
      <!-- One row per version, with a way to copy it back into the draft. -->
      <UiDataTable caption="Published versions" :rows="versions.length" empty="Nothing has been published yet.">
        <template #head>
          <th scope="col">Version</th>
          <th scope="col">Published</th>
          <th scope="col">Action</th>
        </template>
        <tr v-for="v in versions" :key="v.version">
          <th scope="row">{{ v.version }}</th>
          <td>{{ when(v.at) }}</td>
          <td>
            <UiButton variant="secondary" size="sm" :busy="busy === `restore-${v.version}`" @click="restore(v.version)">
              Copy into the draft<span class="mw-visually-hidden"> (version {{ v.version }})</span>
            </UiButton>
          </td>
        </tr>
      </UiDataTable>
    </div>
  </div>
</template>

<style scoped>
/* The view, the status and the versions are columns with the shared gap. */
.page-view,
.page-status,
.versions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The sections are far apart. */
.page-view {
  gap: var(--space-lg);
}

/* No default margins. */
h2,
h3,
p {
  margin: 0;
}

/* The status wraps and may break anywhere in an address. */
.status-line,
.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  overflow-wrap: anywhere;
}

/* An indented list. */
.notes {
  margin: 0;
  padding-inline-start: var(--space-lg);
}
</style>
