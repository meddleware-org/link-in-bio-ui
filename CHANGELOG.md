# Changelog

## 0.0.1 — unreleased

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
