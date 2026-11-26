<script setup lang="ts">
// The footer note on every account-facing view: who the service is for, the acceptable-use rules in one sentence, and the links a
// visitor needs (terms and privacy when the deployment gives them; the report form always).
// The deployment's links, each null when unset.
import { PRIVACY_URL, TERMS_URL } from '../config.js'
</script>

<template>
  <div class="footer-note">
    <!-- Who the service is for, and what a page must not hold. -->
    <p class="footer-note-text">
      For people aged 18 and over. Pages must not hold or link to anything illegal, scams, malware, harassment or someone else’s identity.
    </p>
    <!-- The links, as a labelled navigation region. -->
    <nav aria-label="Terms and reports">
      <ul class="footer-note-links">
        <!-- The terms, when the deployment gives them. -->
        <li v-if="TERMS_URL"><a :href="TERMS_URL">Terms</a></li>
        <!-- The privacy notice, when the deployment gives it. -->
        <li v-if="PRIVACY_URL"><a :href="PRIVACY_URL">Privacy</a></li>
        <!-- The report form, always. -->
        <li><a href="/report">Report a page</a></li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
/* Text and links on one wrapping row. */
.footer-note {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  align-items: baseline;
}

/* No default margin. */
.footer-note-text {
  margin: 0;
}

/* A plain horizontal list. */
.footer-note-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Links inherit the text colour and stay underlined. */
.footer-note a {
  color: inherit;
  text-decoration: underline;
}
</style>
