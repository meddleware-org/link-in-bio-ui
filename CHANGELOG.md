# Changelog

## 0.0.4 — 2026-11-19

- The crypto checkout knows the instance's network (`@meddleware/chain-payments-kit` 0.0.3, `network` prop): a checkout
  for another network says "This checkout is for Sui testnet; this app is on Sui mainnet." and never asks the wallet
  (FU-0144), with a browser test on a mainnet instance in all five browsers.
- CI runs the browser tests one project per job in Playwright's image, with the runner's fonts (D129).

## 0.0.3 — 2026-11-18

- Refunds on request, for link-in-bio-service 0.0.5 (D126): Billing shows what may come back now, as the service works it out
  (a cancellation within 14 days less the days used, months not started, a late payment whole; each less the provider's fee
  share), asks for it (one open request at a time) and withdraws it; past requests show how they ended, with the operator's
  reason when declined.
- The console's refund queue shows each purchase's line (exactly what to send, in its unit, what was taken off, how to send it
  and the provider's identifiers), records a refund per line, declines a request with a reason, and filters by every status;
  requests from before per-purchase lines still show the payment to refund whole.
- The console's Overview shows the change budgets per account (D127) and Web Risk this month, in either mode (D128).
- A 429 shows the service's own words (which budget, and when it resets); the edge's rate limit gets a plain sentence.
- Amounts are shown exactly in their own unit (`amount`): ISO currencies as money, coins with their symbol.

## 0.0.2 — 2026-11-18

- First-pass audit (`docs/audit/link-in-bio-ui-audit.md`).
- Every request has a 30-second deadline; a stalled one ends as "The server could not be reached".
- A provider's payment page and an Open Payments approval page must be https (`httpsHref`); a refused approval address is explained.
- The console tells a sign-in (401/403) from an outage: a 503 says the console is not available, with the service's words and a
  reload; an error page from the edge is an error, not a sign-in.
- The crypto checkout no longer shows the kit's failure code (`rejected`, `unapplied`) as a bare word.
- The uploaded picture's URL passes `safePath`/`safeHref` before it is shown.
- The image build runs the production-bundle scan (`check:dist`), as CI does.
- The accessibility sweep covers 26 states (was 9), and a browser test records every request the local editor makes.
- **Open Payments checkout:** the person enters their wallet address (`https://` or a `$` payment pointer), approves the
  payment in their wallet, and finishes on the way back (`/billing?…&openPayments=finish`). The service checks the
  wallet's hash.
- **Refunds:** a payment that arrived after its checkout closed (credited as months) has an "Ask for a refund" button
  until its refund window ends. The console has a Refunds queue showing what to send and to which address, and records
  the refund transaction.
- The console overview shows the bank feeds and their last read.
- `@meddleware/chain-payments-kit` 0.0.2: a signed payment survives a reload.
- The wallet-address field is labelled (it had no accessible name; caught by the new browser test).

## 0.0.1 — 2026-11-17

- `@meddleware/chain-payments-client` and `@meddleware/chain-payments-kit` come from npm (`^0.0.1`), no longer from sibling folders.
- The crypto checkout gets the wallet adapter's Sui client, so it shows the platform fee read from the chain before
  the wallet opens.
- The app: sign-up (handle, 18+, the current terms, optional country, an invite code when sign-up is by invitation; a passkey or a Sui
  wallet; the ten recovery codes shown once with an "I saved these codes" confirmation), sign-in (passkey with or without a handle, Sui
  wallet, recovery code), and the footer note (18+, acceptable use, terms, privacy, report).
- The page editor: identity, picture upload, links and groups (add, remove, move by keyboard with up and down buttons, the rel=me
  checkbox), the look, contact; the service's issues next to their fields and in a linked summary; a preview in a frame with
  `sandbox=""`; publish and take offline; each link's screening; published versions with restore.
- Billing: the paid period, the offered methods and months, checkout, and past payments. Checkouts: Chain Payments (its `ChainCheckout`
  widget with the wallet), a provider's page (a plain link; the return to `/billing?checkout=<id>` is followed), a bank transfer (each
  detail with a copy button, the reference first, the EPC payload as text), anything else said plainly; the checkout is followed until
  the service confirms it.
- The account: passkeys, wallets, recovery codes, country, invite codes to pass on, decisions and appeals, custom domains with their TXT
  record, export and delete.
- The report form (`/report`), the operator console (`/admin/`) and the local editor (`/edit`, and `/` on a loopback host served by
  `link-in-bio serve --mode local`), which talks to its loopback origin only.
- `LinkInBioView` exported for embedding.
- `@meddleware/chain-payments-kit` and `@meddleware/chain-payments-client` are linked from sibling directories (`file:`); they become
  `^0.0.1` once they are published.
