<script setup lang="ts">
// The acceptable-use rules in short, for the sign-up form and the report form. The terms (a deployment's own document) are the rules
// in full; their link shows only when the deployment gives one.
// The deployment's terms link, null when unset.
import { TERMS_URL } from '../config.js'

// The age comes from the instance; 18 until it is known.
withDefaults(defineProps<{ minimumAge?: number }>(), { minimumAge: 18 })
</script>

<template>
  <div class="aup">
    <!-- Who accounts are for, and the lead-in to the list. -->
    <p class="aup-lead">Accounts are for people aged {{ minimumAge }} and over. A page must not hold or link to:</p>
    <!-- What a page must not hold or link to. -->
    <ul class="aup-list">
      <li>anything illegal, and anything sexual involving a child;</li>
      <li>scams, malware or phishing;</li>
      <li>harassment, threats or hate;</li>
      <li>someone else’s identity, or their copyright or trademark;</li>
      <li>spam.</li>
    </ul>
    <!-- That links are checked, and where the full terms are. -->
    <p class="aup-more">
      Every link is checked for safety; a flagged link is hidden until a person decides.
      <template v-if="TERMS_URL"> The <a :href="TERMS_URL">terms</a> say it in full.</template>
    </p>
  </div>
</template>

<style scoped>
/* A column with a small gap. */
.aup {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

/* No default margin on the lead-in and the closing line. */
.aup-lead,
.aup-more {
  margin: 0;
}

/* An indented list. */
.aup-list {
  margin: 0;
  padding-inline-start: var(--space-lg);
}
</style>
