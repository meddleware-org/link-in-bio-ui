<script setup lang="ts">
// The local editor (`/edit`, and `/` when the page is served by `link-in-bio serve --mode local`): the same editor, over the loopback
// backend's files. It asks nothing of any origin but this computer's: no instance, no account, no wallet, no chain.
// The page editor.
import PageEditor from '../editor/PageEditor.vue'
// The loopback editor backend as a source.
import { localSource } from '../editor/source.js'

// Optionally a replacement `fetch`, for tests.
const props = defineProps<{ fetch?: typeof fetch }>()
// The source: this computer's loopback origin only.
const source = localSource({ fetch: props.fetch })
</script>

<template>
  <div class="local-edit">
    <!-- The page's heading. -->
    <h2>Edit your page</h2>
    <!-- Says where the page is kept, and that nothing leaves the computer. -->
    <p>The page is saved as <code>manifest.json</code> in the folder <code>link-in-bio serve --mode local</code> was started in, on this computer. Nothing is sent anywhere else.</p>
    <!-- The same editor, over the loopback backend's files. -->
    <PageEditor :source="source" />
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.local-edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-md);
}

/* No default margins. */
h2,
p {
  margin: 0;
}
</style>
