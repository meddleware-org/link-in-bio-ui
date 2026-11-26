<script setup lang="ts">
// The whole app, inside whatever shell hosts it: App.vue (the standalone image) or an embedding page. It picks the area by path
// (src/route.ts). On this computer (a loopback host), `/` is the local editor when the server is `link-in-bio serve --mode local`: the
// view asks the loopback origin which API it serves, and asks nothing of any other origin.
// Vue's reactivity, lifecycle and lazy components.
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
// A polite live region for the loading state.
import { UiLiveStatus } from '@meddleware/ui'
// The HTTP layer.
import { createHttp } from './api/http.js'
// The router and the area by path, and the loopback check.
import { areaFor, createRouter, isLoopback, type Area } from './route.js'

// Everything is optional: a test or a host may inject `fetch`, a starting place and a host name.
const props = defineProps<{
  /** Injected for tests and embedding; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Where to start (path and query); defaults to the browser's location. */
  start?: string
  /** The host name the page is served from; defaults to the browser's. */
  hostname?: string
}>()

// Tell the shell the product name and the area on show.
const emit = defineEmits<{
  /** The product name this deployment uses (from the instance), for the shell's title. */
  product: [name: string]
  /** The area shown, so the shell can show the footer note on the account-facing areas. */
  area: [area: Area]
}>()

// Each area loads when first needed, so a visitor to one never downloads the others.
const AppArea = defineAsyncComponent(() => import('./views/app/AppArea.vue'))
const ReportView = defineAsyncComponent(() => import('./views/ReportView.vue'))
const ConsoleArea = defineAsyncComponent(() => import('./views/console/ConsoleArea.vue'))
const LocalEditView = defineAsyncComponent(() => import('./views/LocalEditView.vue'))

// The router, starting where the props or the browser say.
const router = createRouter(props.start)
// The HTTP layer, shared by the areas.
const http = createHttp({ fetch: props.fetch })
// The host name the page is served from.
const host = props.hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname)
// The area found by asking the server, on a loopback host.
const detected = ref<Area | null>(null)
// The area on show: by path, except `/` on a loopback host, which waits for the server's answer.
const area = computed<Area | null>(() => {
  const a = areaFor(router.path.value)
  if (a !== 'app' || !isLoopback(host)) return a
  return detected.value
})

/** On a loopback host, `/` is the local editor unless the server answers the hosted app's instance route. */
/** Decide which API a loopback host serves: the hosted app's, or the local editor's. */
async function detect(): Promise<void> {
  try {
    // The hosted app answers the instance route.
    await http.get('/api/v1/instance')
    detected.value = 'app'
    return
  } catch {
    /* not the hosted app */
  }
  try {
    // The local editor backend answers the theme-options route.
    await http.get('/api/v1/theme/options')
    detected.value = 'edit'
  } catch {
    detected.value = 'app'
  }
}

// Ask the server only where it is needed.
onMounted(() => {
  if (areaFor(router.path.value) === 'app' && isLoopback(host)) void detect()
})
// Tell the shell the area, now and whenever it changes.
watch(area, (a) => a && emit('area', a), { immediate: true })
</script>

<template>
  <div class="link-in-bio-view">
    <!-- Shown while a loopback host is being asked which API it serves. -->
    <UiLiveStatus v-if="area === null" label="Loading" message="Loading…" />
    <!-- The app: sign-up, sign-in, the page editor, billing and the account. -->
    <AppArea v-else-if="area === 'app'" :http="http" :router="router" @product="emit('product', $event)" />
    <!-- The report form, which needs no account. -->
    <ReportView v-else-if="area === 'report'" :http="http" :router="router" @product="emit('product', $event)" />
    <!-- The operator console. -->
    <ConsoleArea v-else-if="area === 'console'" :http="http" />
    <!-- The local editor. -->
    <LocalEditView v-else :fetch="props.fetch" />
  </div>
</template>

<style scoped>
/* A centred column with a wide maximum and the shared spacing. */
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
