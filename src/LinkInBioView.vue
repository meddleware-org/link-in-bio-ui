<script setup lang="ts">
// The whole app, inside whatever shell hosts it: App.vue (the standalone image) or an embedding page. It picks the area by path
// (src/route.ts). On this computer (a loopback host), `/` is the local editor when the server is `link-in-bio serve --mode local`: the
// view asks the loopback origin which API it serves, and asks nothing of any other origin.
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { UiLiveStatus } from '@meddleware/ui'
import { createHttp } from './api/http.js'
import { areaFor, createRouter, isLoopback, type Area } from './route.js'

const props = defineProps<{
  /** Injected for tests and embedding; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Where to start (path and query); defaults to the browser's location. */
  start?: string
  /** The host name the page is served from; defaults to the browser's. */
  hostname?: string
}>()

const emit = defineEmits<{
  /** The product name this deployment uses (from the instance), for the shell's title. */
  product: [name: string]
  /** The area shown, so the shell can show the footer note on the account-facing areas. */
  area: [area: Area]
}>()

const AppArea = defineAsyncComponent(() => import('./views/app/AppArea.vue'))
const ReportView = defineAsyncComponent(() => import('./views/ReportView.vue'))
const ConsoleArea = defineAsyncComponent(() => import('./views/console/ConsoleArea.vue'))
const LocalEditView = defineAsyncComponent(() => import('./views/LocalEditView.vue'))

const router = createRouter(props.start)
const http = createHttp({ fetch: props.fetch })
const host = props.hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname)
const detected = ref<Area | null>(null)
const area = computed<Area | null>(() => {
  const a = areaFor(router.path.value)
  if (a !== 'app' || !isLoopback(host)) return a
  return detected.value
})

/** On a loopback host, `/` is the local editor unless the server answers the hosted app's instance route. */
async function detect(): Promise<void> {
  try {
    await http.get('/api/v1/instance')
    detected.value = 'app'
    return
  } catch {
    /* not the hosted app */
  }
  try {
    await http.get('/api/v1/theme/options')
    detected.value = 'edit'
  } catch {
    detected.value = 'app'
  }
}

onMounted(() => {
  if (areaFor(router.path.value) === 'app' && isLoopback(host)) void detect()
})
watch(area, (a) => a && emit('area', a), { immediate: true })
</script>

<template>
  <div class="link-in-bio-view">
    <UiLiveStatus v-if="area === null" label="Loading" message="Loading…" />
    <AppArea v-else-if="area === 'app'" :http="http" :router="router" @product="emit('product', $event)" />
    <ReportView v-else-if="area === 'report'" :http="http" :router="router" @product="emit('product', $event)" />
    <ConsoleArea v-else-if="area === 'console'" :http="http" />
    <LocalEditView v-else :fetch="props.fetch" />
  </div>
</template>

<style scoped>
.link-in-bio-view {
  box-sizing: border-box;
  inline-size: 100%;
  max-inline-size: 90rem;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md) 0;
}
</style>
