<script setup lang="ts">
// The local editor (`/edit`, and `/` when the page is served by `link-in-bio serve --mode local`): the same editor, over the loopback
// backend's files. It asks nothing of any origin but this computer's: no instance, no account, no wallet, no chain.
import PageEditor from '../editor/PageEditor.vue'
import { localSource } from '../editor/source.js'

const props = defineProps<{ fetch?: typeof fetch }>()
const source = localSource({ fetch: props.fetch })
</script>

<template>
  <div class="local-edit">
    <h2>Edit your page</h2>
    <p>The page is saved as <code>manifest.json</code> in the folder <code>link-in-bio serve --mode local</code> was started in, on this computer. Nothing is sent anywhere else.</p>
    <PageEditor :source="source" />
  </div>
</template>

<style scoped>
.local-edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-md);
}

h2,
p {
  margin: 0;
}
</style>
