<script setup lang="ts">
// The report form (`/report?page=<handle>`): no account, and nobody learns who reported. A person reads every report; a decision
// comes with a statement of reasons the page's owner sees and may appeal.
// Vue's lifecycle and reactive reference.
import { onMounted, ref } from 'vue'
// The shared button, notice, select and text field.
import { UiButton, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
// The typed account API (the report route needs no account).
import { appApi } from '../api/app.js'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The HTTP layer.
import type { Http } from '../api/http.js'
// The acceptable-use rules in short.
import AupSummary from '../components/AupSummary.vue'
// The reasons a report may give.
import { REPORT_REASONS } from '../lib/reasons.js'
// The app's own router, for the query.
import type { Router } from '../route.js'

// The HTTP layer and the router.
const props = defineProps<{ http: Http; router: Router }>()
// Tell the shell the product name once the instance answers.
const emit = defineEmits<{ product: [name: string] }>()
// The typed API.
const api = appApi(props.http)

// The page's handle, from the query, lower-cased and bounded.
const page = ref(props.router.query.value.get('page')?.trim().toLowerCase().slice(0, 30) ?? '')
// The link, if it came in the query.
const link = ref(props.router.query.value.get('url')?.trim().slice(0, 2048) ?? '')
// The reason chosen.
const reason = ref('')
// What the person saw.
const details = ref('')
// An optional address the person may be written to at; it is sent to the service only with the report.
const contact = ref('')
// True while the report is being sent.
const busy = ref(false)
// A failed send, in words.
const problem = ref('')
// True once the report was sent.
const sent = ref(false)
// The domain pages live under, for the handle's hint.
const pagesDomain = ref('')

// Ask the instance for the product name and the pages domain.
onMounted(async () => {
  try {
    const i = await api.instance()
    // Tell the shell the product's name.
    emit('product', i.product)
    pagesDomain.value = i.pagesDomain
  } catch {
    /* the form works without it */
  }
})

/** Send the report to the service; nobody learns who reported. */
async function submit(): Promise<void> {
  // One send at a time.
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    // Empty optional fields are left out.
    await api.report({
      page: page.value.trim(),
      url: link.value.trim() || undefined,
      reason: reason.value,
      details: details.value.trim(),
      contact: contact.value.trim() || undefined,
    })
    sent.value = true
  } catch (e) {
    problem.value = describeError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="report">
    <!-- The page's heading. -->
    <h2>Report a page</h2>

    <!-- Thanks, and what happens next. -->
    <section v-if="sent" class="report-done" aria-labelledby="report-done-title">
      <h3 id="report-done-title">Thank you: your report was sent</h3>
      <p>A person will look at it. If the page or the link breaks the rules, it is hidden or taken down, and its owner is told why.</p>
      <!-- We may write back, but never tell the owner who reported. -->
      <p v-if="contact.trim()">We may write to the address you gave if we need to know more. We do not tell the page’s owner who reported it.</p>
      <!-- No address was given, so there is no way to tell the person the outcome. -->
      <p v-else>You gave no address, so we cannot tell you the outcome. We do not tell the page’s owner who reported it.</p>
    </section>

    <!-- The form. -->
    <form v-else class="report-form" @submit.prevent="submit">
      <p>Tell us about a page, or one link on it, that breaks the rules. You do not need an account, and the page’s owner is not told who reported it.</p>
      <!-- The rules in short, so the person knows what counts. -->
      <AupSummary />
      <UiTextField
        id="report-page"
        v-model="page"
        label="The page’s handle"
        :hint="pagesDomain ? `the part before .${pagesDomain}` : 'the name in the page’s address'"
        spellcheck="false"
        required
      />
      <!-- The link, if it is one link. -->
      <UiTextField id="report-url" v-model="link" label="The link, if it is one link (optional)" type="url" hint="https://… or mailto:…" />
      <!-- What is wrong, from the service's list. -->
      <UiSelectField id="report-reason" v-model="reason" label="What is wrong" placeholder="Choose one" :options="REPORT_REASONS" required />
      <!-- What the person saw, up to 4000 characters. -->
      <UiTextField id="report-details" v-model="details" label="Details (optional)" :rows="5" :maxlength="4000" hint="what you saw, and where; at most 4000 characters" />
      <!-- An optional address, only if the person is happy to be asked more. -->
      <UiTextField id="report-contact" v-model="contact" label="Your email address (optional)" type="email" autocomplete="email" hint="only if you are happy for us to ask you more" />
      <!-- Where there is immediate danger the emergency services come first. -->
      <UiNotice type="info" message="If someone is in immediate danger, contact the emergency services first." />
      <!-- A failed send. -->
      <UiNotice v-if="problem" type="error" :message="problem" />
      <!-- Sending needs a page and a reason. -->
      <p><UiButton type="submit" :busy="busy" :disabled="!page.trim() || !reason">Send the report</UiButton></p>
    </form>
  </div>
</template>

<style scoped>
/* A centred column with the shared tool width. */
.report {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  box-sizing: border-box;
  inline-size: 100%;
  max-inline-size: calc(var(--mw-tool-content-max) + 2 * var(--space-md));
  margin-inline: auto;
  padding: 0 var(--space-md);
}

/* The form and the thanks are columns with the shared gap. */
.report-form,
.report-done {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* No default margins. */
h2,
h3,
p {
  margin: 0;
}
</style>
