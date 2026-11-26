<script setup lang="ts">
// Standalone shell: the shared tool shell around LinkInBioView (also exported). The title is the product name the instance gives (the
// generic name until it arrives). Not contained: the editor sits beside its preview and the console has wide tables, so each area sets
// its own width (LinkInBioView). The footer note (age, acceptable use, terms, privacy, report) shows on every account-facing area.
// Vue's reactive reference.
import { ref } from 'vue'
// The shared tool shell: header, colour mode and footer.
import { AppToolShell } from '@meddleware/ui'
// The product itself.
import LinkInBioView from './LinkInBioView.vue'
// The footer note (age, acceptable use, terms, privacy, report).
import FooterNote from './components/FooterNote.vue'
// The generic product name, used until the instance gives its own.
import { DEFAULT_PRODUCT } from './config.js'
// The four areas.
import type { Area } from './route.js'

// The shell's title: the product name.
const title = ref(DEFAULT_PRODUCT)
// The area on show, so the footer note can be hidden in the console.
const area = ref<Area | null>(null)

/** Set the shell's title and the browser tab's title to the product's name. */
function setProduct(name: string): void {
  title.value = name
  document.title = name
}
</script>

<template>
  <AppToolShell :title="title" slug="link-in-bio" :docs-url="false" :dev-url="false" :contained="false">
    <!-- The product; it reports the product name and the area. -->
    <LinkInBioView @product="setProduct" @area="area = $event" />
    <!-- The footer note appears on every area except the operator console. -->
    <template v-if="area !== 'console'" #footer-note>
      <!-- The footer note. -->
      <FooterNote />
    </template>
  </AppToolShell>
</template>
