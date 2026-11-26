<script setup lang="ts">
// so nothing in the rendered page can reach the app, its cookie or its API. The HTML is the service's own renderer's output.
//
// The frame is a tab stop (a keyboard user scrolls the page inside it). When focus is inside a frame the frame element matches neither
// :focus nor :focus-within, so the app notices focus leaving its own window for the frame and draws the focus ring itself.
// Vue's lifecycle and reactive reference.
import { onBeforeUnmount, onMounted, ref } from 'vue'
// How the frame gets the page: a URL or the HTML.
import type { Preview } from '../editor/source.js'

// What to show, and an optional title for the frame.
defineProps<{ preview: Preview | null; title?: string }>()

// The iframe element.
const frame = ref<HTMLIFrameElement | null>(null)
// True while the frame has keyboard focus (drawn as a ring).
const focused = ref(false)
// Browsers differ in what they report when focus enters a frame: Chromium blurs the window, and Firefox sends no event at all (the
// element that had focus sends focusout and the frame becomes `document.activeElement` a moment later). So after any focus change the app
// looks at `document.activeElement` for a short while (about half a second, only then), and the frame's own focus event, where a browser
// sends one, sets the ring at once.
// Whether the frame is the focused element right now.
const read = () => (focused.value = !!frame.value && document.activeElement === frame.value)
// How many times the frame has been checked since the last change.
let polls = 0
// The interval that checks, while one is running.
let timer: ReturnType<typeof setInterval> | undefined
// Check now, then keep checking for about half a second (30 checks at 16 ms).
const check = () => {
  read()
  polls = 0
  timer ??= setInterval(() => {
    read()
    if (++polls >= 30) {
      clearInterval(timer)
      timer = undefined
    }
  }, 16)
}
/** The frame's own focus event means it has focus now: no need to wait for `activeElement`. */
const entered = () => {
  focused.value = true
  check()
}
// The focus changes that may mean focus moved into or out of the frame.
const EVENTS = [
  [window, 'blur'],
  [window, 'focus'],
  [document, 'focusout'],
  [document, 'focusin'],
] as const
// Listen for them.
onMounted(() => {
  for (const [target, name] of EVENTS) target.addEventListener(name, check)
})
// Stop listening, and stop the interval.
onBeforeUnmount(() => {
  for (const [target, name] of EVENTS) target.removeEventListener(name, check)
  clearInterval(timer)
})
</script>

<template>
  <iframe
    v-if="preview"
    ref="frame"
    class="preview-frame"
    :class="{ 'preview-frame--focused': focused }"
    @focus="entered"
    @blur="check"
    sandbox=""
    referrerpolicy="no-referrer"
    :title="title ?? 'Preview of your page'"
    :src="'src' in preview ? preview.src : undefined"
    :srcdoc="'html' in preview ? preview.html : undefined"
  ></iframe>
</template>

<style scoped>
/* Full width, a fixed height, with a border. */
.preview-frame {
  inline-size: 100%;
  block-size: 36rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}

/* The focus ring, drawn by the app when the browser cannot. */
.preview-frame:focus,
.preview-frame--focused {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
