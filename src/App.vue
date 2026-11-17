<script setup lang="ts">
// Standalone shell: the shared tool shell around LinkInBioView (also exported). The title is the product name the instance gives (the
// generic name until it arrives). Not contained: the editor sits beside its preview and the console has wide tables, so each area sets
// its own width (LinkInBioView). The footer note (age, acceptable use, terms, privacy, report) shows on every account-facing area.
import { ref } from 'vue'
import { AppToolShell } from '@meddleware/ui'
import LinkInBioView from './LinkInBioView.vue'
import FooterNote from './components/FooterNote.vue'
import { DEFAULT_PRODUCT } from './config.js'
import type { Area } from './route.js'

const title = ref(DEFAULT_PRODUCT)
const area = ref<Area | null>(null)

function setProduct(name: string): void {
  title.value = name
  document.title = name
}
</script>

<template>
  <AppToolShell :title="title" slug="link-in-bio" :docs-url="false" :dev-url="false" :contained="false">
    <LinkInBioView @product="setProduct" @area="area = $event" />
    <template v-if="area !== 'console'" #footer-note>
      <FooterNote />
    </template>
  </AppToolShell>
</template>
