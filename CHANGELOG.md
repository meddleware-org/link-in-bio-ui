# Changelog

## 0.0.2 — 2026-11-18

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
