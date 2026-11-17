<script setup lang="ts">
// The signed-in account's page: whether it is published, publishing and taking it offline, the editor over the draft, the links'
// screening, and the published versions (any can be copied back into the draft).
import { computed, onMounted, ref, shallowRef } from 'vue'
import { UiBadge, UiButton, UiDataTable, UiLiveStatus, UiNotice } from '@meddleware/ui'
import { safeHref } from '@meddleware/web-utils'
import { ApiError, describeError } from '../../api/errors.js'
import type { PageState, Published } from '../../api/types.js'
import PageEditor from '../../editor/PageEditor.vue'
import { hostedSource, type Loaded } from '../../editor/source.js'
import { useApp } from '../../context.js'
import { when } from '../../lib/format.js'

const emit = defineEmits<{ navigate: [tab: string] }>()
const { api, http, me } = useApp()
const source = hostedSource(http)

const page = shallowRef<PageState | null>(null)
const versions = ref<Array<{ version: number; at: string }>>([])
const published = shallowRef<Published | null>(null)
const busy = ref('')
const problem = ref('')
const needsPayment = ref(false)
const status = ref('')
const editorKey = ref(0)

async function refresh(): Promise<void> {
  try {
    page.value = await api.page()
    versions.value = (await api.versions()).versions
  } catch (e) {
    problem.value = describeError(e)
  }
}

function loaded(l: Loaded): void {
  if (l.page) page.value = l.page
}

onMounted(async () => {
  try {
    versions.value = (await api.versions()).versions
  } catch (e) {
    problem.value = describeError(e)
  }
})

async function act(name: string, f: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = name
  problem.value = ''
  needsPayment.value = false
  try {
    await f()
  } catch (e) {
    problem.value = describeError(e)
    needsPayment.value = e instanceof ApiError && e.status === 409 && !me.value?.entitled
  } finally {
    busy.value = ''
  }
}

const publish = () =>
  act('publish', async () => {
    published.value = await api.publish()
    status.value = `Published version ${published.value.version}.`
    await refresh()
  })

const unpublish = () =>
  act('unpublish', async () => {
    await api.unpublish()
    published.value = null
    status.value = 'Your page is offline.'
    await refresh()
  })

const restore = (v: number) =>
  act(`restore-${v}`, async () => {
    await api.restore(v)
    status.value = `Version ${v} is now the draft.`
    editorKey.value++
    await refresh()
  })

const pageLink = computed(() => safeHref(page.value?.url))
</script>

<template>
  <div class="page-view">
    <h2>Your page</h2>

    <section class="page-status" aria-labelledby="page-status-title">
      <h3 id="page-status-title" class="mw-visually-hidden">Publishing</h3>
      <p v-if="page" class="status-line">
        <UiBadge :tone="page.published ? 'ok' : 'neutral'">{{ page.published ? 'Published' : 'Not published' }}</UiBadge>
        <template v-if="page.published">
          version {{ page.version }}, {{ when(page.publishedAt) }}
          <template v-if="page.changed"> · the draft has changes that are not published</template>
        </template>
        <template v-if="pageLink"> · <a :href="pageLink">{{ page.url }}</a></template>
      </p>
      <p class="status-actions">
        <UiButton :busy="busy === 'publish'" @click="publish">{{ page?.published ? 'Publish the draft' : 'Publish' }}</UiButton>
        <UiButton v-if="page?.published" variant="secondary" :busy="busy === 'unpublish'" @click="unpublish">Take the page offline</UiButton>
      </p>
      <UiNotice v-if="problem" type="error" :message="problem" />
      <p v-if="needsPayment"><UiButton variant="secondary" @click="emit('navigate', 'billing')">Go to billing</UiButton></p>
      <UiNotice v-if="published && !published.online" type="info" message="Your page is published. Pages from accounts like yours are not served on this service yet; it goes online as soon as they are." />
      <template v-if="published?.hidden.length">
        <UiNotice type="warning" message="These links were flagged as unsafe and are hidden until a person decides:" />
        <ul class="notes">
          <li v-for="h in published.hidden" :key="h.url"><code>{{ h.url }}</code></li>
          </ul>
      </template>
      <UiLiveStatus label="Publishing" :message="status" />
    </section>

    <PageEditor :key="editorKey" :source="source" :screening="page?.screening ?? []" @loaded="loaded" @saved="refresh" />

    <div class="versions">
      <h3 id="versions-title">Published versions</h3>
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
.page-view,
.page-status,
.versions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.page-view {
  gap: var(--space-lg);
}

h2,
h3,
p {
  margin: 0;
}

.status-line,
.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  overflow-wrap: anywhere;
}

.notes {
  margin: 0;
  padding-inline-start: var(--space-lg);
}
</style>
