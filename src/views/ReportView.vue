<script setup lang="ts">
// The report form (`/report?page=<handle>`): no account, and nobody learns who reported. A person reads every report; a decision
// comes with a statement of reasons the page's owner sees and may appeal.
import { onMounted, ref } from 'vue'
import { UiButton, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
import { appApi } from '../api/app.js'
import { describeError } from '../api/errors.js'
import type { Http } from '../api/http.js'
import AupSummary from '../components/AupSummary.vue'
import { REPORT_REASONS } from '../lib/reasons.js'
import type { Router } from '../route.js'

const props = defineProps<{ http: Http; router: Router }>()
const emit = defineEmits<{ product: [name: string] }>()
const api = appApi(props.http)

const page = ref(props.router.query.value.get('page')?.trim().toLowerCase().slice(0, 30) ?? '')
const link = ref(props.router.query.value.get('url')?.trim().slice(0, 2048) ?? '')
const reason = ref('')
const details = ref('')
const contact = ref('')
const busy = ref(false)
const problem = ref('')
const sent = ref(false)
const pagesDomain = ref('')

onMounted(async () => {
  try {
    const i = await api.instance()
    emit('product', i.product)
    pagesDomain.value = i.pagesDomain
  } catch {
    /* the form works without it */
  }
})

async function submit(): Promise<void> {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
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
    <h2>Report a page</h2>

    <section v-if="sent" class="report-done" aria-labelledby="report-done-title">
      <h3 id="report-done-title">Thank you: your report was sent</h3>
      <p>A person will look at it. If the page or the link breaks the rules, it is hidden or taken down, and its owner is told why.</p>
      <p v-if="contact.trim()">We may write to the address you gave if we need to know more. We do not tell the page’s owner who reported it.</p>
      <p v-else>You gave no address, so we cannot tell you the outcome. We do not tell the page’s owner who reported it.</p>
    </section>

    <form v-else class="report-form" @submit.prevent="submit">
      <p>Tell us about a page, or one link on it, that breaks the rules. You do not need an account, and the page’s owner is not told who reported it.</p>
      <AupSummary />
      <UiTextField
        id="report-page"
        v-model="page"
        label="The page’s handle"
        :hint="pagesDomain ? `the part before .${pagesDomain}` : 'the name in the page’s address'"
        spellcheck="false"
        required
      />
      <UiTextField id="report-url" v-model="link" label="The link, if it is one link (optional)" type="url" hint="https://… or mailto:…" />
      <UiSelectField id="report-reason" v-model="reason" label="What is wrong" placeholder="Choose one" :options="REPORT_REASONS" required />
      <UiTextField id="report-details" v-model="details" label="Details (optional)" :rows="5" :maxlength="4000" hint="what you saw, and where; at most 4000 characters" />
      <UiTextField id="report-contact" v-model="contact" label="Your email address (optional)" type="email" autocomplete="email" hint="only if you are happy for us to ask you more" />
      <UiNotice type="info" message="If someone is in immediate danger, contact the emergency services first." />
      <UiNotice v-if="problem" type="error" :message="problem" />
      <p><UiButton type="submit" :busy="busy" :disabled="!page.trim() || !reason">Send the report</UiButton></p>
    </form>
  </div>
</template>

<style scoped>
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

.report-form,
.report-done {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

h2,
h3,
p {
  margin: 0;
}
</style>
