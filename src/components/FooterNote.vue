<script setup lang="ts">
// The footer note on every account-facing view: who the service is for, the acceptable-use rules in one sentence, and the links a
// visitor needs (terms and privacy when the deployment gives them; the report form always).
import { PRIVACY_URL, TERMS_URL } from '../config.js'
</script>

<template>
  <div class="footer-note">
    <p class="footer-note-text">
      For people aged 18 and over. Pages must not hold or link to anything illegal, scams, malware, harassment or someone else’s identity.
    </p>
    <nav aria-label="Terms and reports">
      <ul class="footer-note-links">
        <li v-if="TERMS_URL"><a :href="TERMS_URL">Terms</a></li>
        <li v-if="PRIVACY_URL"><a :href="PRIVACY_URL">Privacy</a></li>
        <li><a href="/report">Report a page</a></li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
.footer-note {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  align-items: baseline;
}

.footer-note-text {
  margin: 0;
}

.footer-note-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.footer-note a {
  color: inherit;
  text-decoration: underline;
}
</style>
