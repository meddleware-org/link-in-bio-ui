<script setup lang="ts">
// The account: its ways to sign in (passkeys, wallets, recovery codes), the declared country, the invite codes it was given to pass
// on, decisions about its page and its appeals, custom domains (when the service offers them), and its data (export, delete).
// Vue's reactivity and lifecycle.
import { computed, onMounted, ref, shallowRef } from 'vue'
// The shared button, copy button, table, live status, notice, select and text field.
import { UiButton, UiCopyButton, UiDataTable, UiLiveStatus, UiNotice, UiSelectField, UiTextField } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../../api/errors.js'
// The shapes this view reads.
import type { Domains, HeldInvites, Statements } from '../../api/types.js'
// Make a passkey, and whether the browser can.
import { createPasskey, passkeysSupported } from '../../api/webauthn.js'
// The one-time recovery codes.
import RecoveryCodes from '../../components/RecoveryCodes.vue'
// Connect or disconnect the wallet.
import WalletControl from '../../components/WalletControl.vue'
// The app context.
import { useApp } from '../../context.js'
// The country choices.
import { countryOptions } from '../../lib/countries.js'
// Dates and shortened addresses for people.
import { day, short, when } from '../../lib/format.js'
// The plain words for a report reason.
import { reasonLabel } from '../../lib/reasons.js'
// Sign a message with the wallet, and the wallet singleton.
import { signMessage, useWallet } from '../../wallet.js'

// Tell the area when the account was deleted.
const emit = defineEmits<{ 'signed-out': [] }>()
// The typed API, who is signed in, and a way to re-read it.
const { api, me, refreshMe } = useApp()
// The connected wallet account, if any.
const { account: wallet } = useWallet()

// The invites the account holds.
const invites = shallowRef<HeldInvites | null>(null)
// The decisions about the account's page and its appeals.
const statements = shallowRef<Statements | null>(null)
// The custom domains, when the instance offers them.
const domains = shallowRef<Domains | null>(null)
// A polite announcement of what just happened.
const status = ref('')
// A failure, and which action it belongs to.
const problem = ref<{ where: string; text: string } | null>(null)
// Which action is in flight.
const busy = ref('')
// New recovery codes, shown once.
const newCodes = ref<string[] | null>(null)
// A name for a new passkey.
const passkeyName = ref('')
// The country being edited.
const country = ref(me.value?.country ?? '')
// A domain being added.
const hostname = ref('')
// The decision an appeal is about.
const appealReport = ref('')
// The appeal's text.
const appealText = ref('')
// The handle typed to confirm deletion.
const confirmHandle = ref('')
// The country choices.
const countries = countryOptions()

// Read invites, decisions and domains independently: one failing must not hide the others.
onMounted(async () => {
  const [i, s, d] = await Promise.allSettled([api.invites(), api.statements(), api.domains()])
  if (i.status === 'fulfilled') invites.value = i.value
  if (s.status === 'fulfilled') statements.value = s.value
  if (d.status === 'fulfilled') domains.value = d.value
})

/** Run one action: one at a time; a failure is said under that action; the result is announced. */
async function act(where: string, f: () => Promise<string | void>): Promise<void> {
  if (busy.value) return
  busy.value = where
  problem.value = null
  try {
    const said = await f()
    if (said) status.value = said
  } catch (e) {
    problem.value = { where, text: describeError(e) }
  } finally {
    busy.value = ''
  }
}
// The failure text for an action, or empty.
const failed = (where: string) => (problem.value?.where === where ? problem.value.text : '')

// Add a passkey: the service starts a ceremony, the browser makes the passkey, the service stores it.
const addPasskey = () =>
  act('passkey', async () => {
    const start = await api.passkeyAddStart()
    const credential = await createPasskey(start.options)
    await api.passkeyAddFinish({ challenge: start.challenge, credential, name: passkeyName.value.trim() || undefined })
    passkeyName.value = ''
    await refreshMe()
    return 'Passkey added.'
  })
// Remove a passkey (the service will not remove the last way to sign in).
const removePasskey = (id: string, name: string) =>
  act(`passkey-${id}`, async () => {
    await api.passkeyRemove(id)
    await refreshMe()
    return `Removed the passkey “${name}”.`
  })
// Link the connected wallet: it signs the service's message.
const linkWallet = () =>
  act('wallet', async () => {
    const address = wallet.value?.address
    if (!address) throw new Error('Connect a wallet first.')
    const start = await api.walletLinkStart(address)
    await api.walletLinkFinish({ challenge: start.challenge, signature: await signMessage(start.message) })
    await refreshMe()
    return 'Wallet linked.'
  })
// Unlink a wallet.
const unlinkWallet = (address: string) =>
  act(`wallet-${address}`, async () => {
    await api.walletUnlink(address)
    await refreshMe()
    return 'Wallet unlinked.'
  })
// Replace the recovery codes with ten new ones; the old ones stop working.
const replaceCodes = () =>
  act('codes', async () => {
    newCodes.value = (await api.replaceRecoveryCodes()).recoveryCodes
    await refreshMe()
    return 'New recovery codes made; the old ones no longer work.'
  })
// Save the declared country (or clear it).
const saveCountry = () =>
  act('country', async () => {
    await api.setCountry(country.value || null)
    await refreshMe()
    return 'Country saved.'
  })
// Add a custom domain; the service answers with the TXT record to publish.
const addDomain = () =>
  act('domain', async () => {
    await api.addDomain(hostname.value.trim())
    hostname.value = ''
    domains.value = await api.domains()
    return 'Domain added. Create the TXT record shown below.'
  })
// Remove a custom domain.
const removeDomain = (h: string) =>
  act(`domain-${h}`, async () => {
    await api.removeDomain(h)
    domains.value = await api.domains()
    return `Removed ${h}.`
  })
// Send an appeal about a decision, or about nothing in particular.
const sendAppeal = () =>
  act('appeal', async () => {
    await api.appeal({ report: appealReport.value || undefined, text: appealText.value.trim() })
    appealText.value = ''
    statements.value = await api.statements()
    return 'Your appeal was sent. A person will read it and you will see the answer here.'
  })
// Delete the account; the handle must be typed to confirm.
const deleteAccount = () =>
  act('delete', async () => {
    await api.deleteMe(confirmHandle.value.trim())
    emit('signed-out')
  })

// The decisions an appeal can be about.
const appealOptions = computed(() =>
  (statements.value?.statements ?? []).map((s) => [s.report, `${reasonLabel(s.reason)}, ${day(s.decidedAt)}`] as const),
)
// Deletion is allowed only once the person has typed their own handle.
const canDelete = computed(() => !!me.value && confirmHandle.value.trim() === me.value.handle)
// The words for each appeal status.
const APPEAL_STATUS: Record<string, string> = { open: 'Waiting for a decision', upheld: 'Upheld: the decision was reversed', rejected: 'Not upheld' }
</script>

<template>
  <div v-if="me" class="account">
    <!-- The view's heading. -->
    <h2>Account</h2>
    <!-- Announces what just happened. -->
    <UiLiveStatus label="Account" :message="status" />

    <!-- Ways to sign in. -->
    <section class="part" aria-labelledby="acc-signin">
      <h3 id="acc-signin">Ways to sign in</h3>
      <p>Keep at least one. The service will not remove the last.</p>

      <!-- The passkeys. -->
      <!-- The passkeys. -->
      <h4>Passkeys</h4>
      <ul v-if="me.passkeys.length" class="rows">
        <li v-for="p in me.passkeys" :key="p.id">
          <span>{{ p.name }}</span>
          <UiButton variant="ghost" size="sm" :busy="busy === `passkey-${p.id}`" @click="removePasskey(p.id, p.name)">Remove<span class="mw-visually-hidden"> (passkey {{ p.name }})</span></UiButton>
        </li>
      </ul>
      <p v-else>No passkeys.</p>
      <!-- Adding a passkey, only where the browser can. -->
      <form v-if="passkeysSupported()" class="inline-form" @submit.prevent="addPasskey">
        <UiTextField id="acc-passkey-name" v-model="passkeyName" label="Name for a new passkey (optional)" :maxlength="60" />
        <UiButton type="submit" variant="secondary" :busy="busy === 'passkey'">Add a passkey</UiButton>
      </form>
      <UiNotice v-if="failed('passkey')" type="error" :message="failed('passkey')" />

      <!-- The linked wallets. -->
      <h4>Sui wallets</h4>
      <ul v-if="me.wallets.length" class="rows">
        <li v-for="w in me.wallets" :key="w">
          <code :title="w">{{ short(w, 10) }}</code>
          <UiButton variant="ghost" size="sm" :busy="busy === `wallet-${w}`" @click="unlinkWallet(w)">Unlink<span class="mw-visually-hidden"> (wallet {{ short(w) }})</span></UiButton>
        </li>
      </ul>
      <p v-else>No wallets.</p>
      <!-- Connect a wallet first. -->
      <WalletControl label="Connect a wallet to link it" />
      <p><UiButton variant="secondary" :disabled="!wallet" :busy="busy === 'wallet'" @click="linkWallet">Link the connected wallet</UiButton></p>
      <UiNotice v-if="failed('wallet')" type="error" :message="failed('wallet')" />

      <!-- The recovery codes. -->
      <h4>Recovery codes</h4>
      <!-- New codes, shown once. -->
      <RecoveryCodes v-if="newCodes" :codes="newCodes" :level="3" @done="newCodes = null" />
      <template v-else>
        <p>{{ me.recoveryCodesLeft }} of 10 left. Replacing them makes ten new ones and stops the old ones working.</p>
        <p><UiButton variant="secondary" :busy="busy === 'codes'" @click="replaceCodes">Replace the recovery codes</UiButton></p>
      </template>
      <UiNotice v-if="failed('codes')" type="error" :message="failed('codes')" />
      <UiNotice v-if="problem?.where.startsWith('passkey-') || problem?.where.startsWith('wallet-')" type="error" :message="problem.text" />
    </section>

    <!-- The declared country. -->
    <section class="part" aria-labelledby="acc-country">
      <!-- The country section's heading. -->
      <h3 id="acc-country">Country</h3>
      <form class="inline-form" @submit.prevent="saveCountry">
        <UiSelectField id="acc-country-select" v-model="country" label="Where you live" placeholder="Not given" :options="countries" hint="kept as tax evidence for payments" />
        <UiButton type="submit" variant="secondary" :busy="busy === 'country'">Save the country</UiButton>
      </form>
      <UiNotice v-if="failed('country')" type="error" :message="failed('country')" />
    </section>

    <!-- Invite codes to pass on. -->
    <section class="part" aria-labelledby="acc-invites">
      <h3 id="acc-invites">Invite codes to pass on</h3>
      <template v-if="invites">
        <ul v-if="invites.codes.length" class="rows">
          <li v-for="c in invites.codes" :key="c.code">
            <code>{{ c.code }}</code>
            <span class="muted">until {{ day(c.expiresAt) }}</span>
            <UiCopyButton :value="c.code" :label="`Copy the invite code ${c.code}`" />
          </li>
        </ul>
        <p v-else>You have no invite codes to pass on.</p>
        <p v-if="invites.redeemed">{{ invites.redeemed }} of the codes you passed on have been used.</p>
      </template>
    </section>

    <!-- Decisions about the page, and appeals. -->
    <section class="part" aria-labelledby="acc-decisions">
      <h3 id="acc-decisions">Decisions about your page</h3>
      <template v-if="statements">
        <p v-if="!statements.statements.length">There are none.</p>
        <!-- Each decision with its statement of reasons. -->
        <article v-for="s in statements.statements" :key="s.report" class="decision">
          <h4>{{ reasonLabel(s.reason) }}: {{ s.decision ?? 'decided' }}</h4>
          <p class="muted">{{ when(s.decidedAt) }}</p>
          <p v-if="s.statement" class="statement">{{ s.statement }}</p>
        </article>
        <template v-if="statements.appeals.length">
          <h4>Your appeals</h4>
          <ul class="appeals">
            <li v-for="a in statements.appeals" :key="a.appeal">
              {{ when(a.at) }}: {{ APPEAL_STATUS[a.status] ?? a.status }}<template v-if="a.statement">. {{ a.statement }}</template>
            </li>
          </ul>
        </template>
        <!-- Appealing a decision. -->
        <form class="appeal-form" @submit.prevent="sendAppeal">
          <h4>Appeal a decision</h4>
          <UiSelectField v-if="appealOptions.length" id="acc-appeal-report" v-model="appealReport" label="Which decision" placeholder="Not about one decision" :options="appealOptions" />
          <UiTextField id="acc-appeal-text" v-model="appealText" label="Why the decision is wrong" :rows="4" :maxlength="4000" required />
          <p><UiButton type="submit" variant="secondary" :busy="busy === 'appeal'" :disabled="!appealText.trim()">Send the appeal</UiButton></p>
        </form>
        <UiNotice v-if="failed('appeal')" type="error" :message="failed('appeal')" />
      </template>
    </section>

    <!-- The person's own domains, when offered. -->
    <section v-if="domains?.enabled" class="part" aria-labelledby="acc-domains">
      <h3 id="acc-domains">Your own domain</h3>
      <p>Point a domain you own at your page. Add it here, then create the TXT record shown in the domain’s DNS.</p>
      <!-- Each domain with its verification status and the TXT record to publish. -->
      <UiDataTable caption="Custom domains" :rows="domains.domains.length" empty="No domains yet.">
        <template #head>
          <th scope="col">Domain</th>
          <th scope="col">Status</th>
          <th scope="col">TXT record</th>
          <th scope="col">Action</th>
        </template>
        <tr v-for="d in domains.domains" :key="d.hostname">
          <th scope="row">{{ d.hostname }}</th>
          <td>{{ d.status === 'verified' ? `Verified ${day(d.verifiedAt)}` : d.status === 'failed' ? 'Not verified: check the record' : 'Waiting for the record' }}</td>
          <td>
            <div class="txt">
            <span>Name <code>{{ d.record.name }}</code> <UiCopyButton :value="d.record.name" :label="`Copy the record name for ${d.hostname}`" /></span>
            <span>Value <code>{{ d.record.value }}</code> <UiCopyButton :value="d.record.value" :label="`Copy the record value for ${d.hostname}`" /></span>
            </div>
          </td>
          <td><UiButton variant="ghost" size="sm" :busy="busy === `domain-${d.hostname}`" @click="removeDomain(d.hostname)">Remove<span class="mw-visually-hidden"> ({{ d.hostname }})</span></UiButton></td>
        </tr>
      </UiDataTable>
      <form class="inline-form" @submit.prevent="addDomain">
        <UiTextField id="acc-domain" v-model="hostname" label="Domain" hint="for example links.example.org" spellcheck="false" />
        <UiButton type="submit" variant="secondary" :busy="busy === 'domain'" :disabled="!hostname.trim()">Add the domain</UiButton>
      </form>
      <UiNotice v-if="failed('domain') || problem?.where.startsWith('domain-')" type="error" :message="problem?.text ?? ''" />
    </section>

    <!-- The person's data: export and delete. -->
    <section class="part" aria-labelledby="acc-data">
      <h3 id="acc-data">Your data</h3>
      <!-- The export is a plain link, so the browser downloads it with the session cookie. -->
      <p><a :href="api.exportPath" download>Download everything stored about your account (JSON)</a></p>
      <!-- Deleting the account, which needs the handle typed. -->
      <form class="delete-form" @submit.prevent="deleteAccount">
        <h4>Delete the account</h4>
        <p>This removes your page, pictures, domains and ways to sign in. Your handle is never given to anyone else. Payment records stay, as the law requires.</p>
        <UiTextField id="acc-delete-confirm" v-model="confirmHandle" :label="`Type your handle (${me.handle}) to confirm`" spellcheck="false" autocomplete="off" />
        <p><UiButton type="submit" variant="danger" :disabled="!canDelete" :busy="busy === 'delete'">Delete the account</UiButton></p>
      </form>
      <UiNotice v-if="failed('delete')" type="error" :message="failed('delete')" />
    </section>
  </div>
</template>

<style scoped>
/* The view and its parts are columns with the shared gap. */
.account,
.part,
.appeal-form,
.delete-form,
.decision {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The parts are far apart, and the text keeps a readable width. */
.account {
  gap: var(--space-xl);
  max-inline-size: var(--mw-content-prose);
}

/* No default margins. */
h2,
h3,
h4,
p {
  margin: 0;
}

/* A plain column. */
.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A row wraps and may break anywhere in an address. */
.rows li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
  overflow-wrap: anywhere;
}

/* A form's fields and button on one wrapping row. */
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* De-emphasised text. */
.muted {
  color: var(--muted);
}

/* A statement keeps its line breaks. */
.statement {
  white-space: pre-wrap;
}

/* An indented list. */
.appeals {
  margin: 0;
  padding-inline-start: var(--space-lg);
}

/* The TXT record's name and value, one above the other. */
.txt {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  overflow-wrap: anywhere;
}
</style>
