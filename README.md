# @meddleware/link-in-bio-ui

The user interface of the hosted Link in Bio service: signing up and in, the page editor, billing, the account, the report form, the
operator console and the local editor. A Vue 3 single-page app on `@meddleware/ui`, served by static-server, and exported as
`LinkInBioView` for embedding. Backend: [link-in-bio-service](https://github.com/meddleware-org/link-in-bio-service). It is an image only;
nothing is published to npm.

| Path | Area | What it does |
| --- | --- | --- |
| `/` | App | Sign up (handle, 18+, the current terms, optional country, an invite code when sign-up is by invitation; a passkey or a Sui wallet; the ten recovery codes shown once). Sign in with a passkey, a Sui wallet or a recovery code. Then: **Your page** (the editor, publishing, screening of each link, published versions), **Billing** (paid period, ways to pay, checkout, past payments) and **Account** (passkeys, wallets, recovery codes, country, invite codes to pass on, decisions and appeals, custom domains, export, delete). |
| `/billing?checkout=<id>` | App | Where a payment provider's page sends the person back: billing opens and follows that checkout until the service confirms it. |
| `/report?page=<handle>` | Report | The report form: no account needed. |
| `/admin/` | Console | The operator console: overview, accounts (flags, suspend, grant months, invite tree, billing, audit), invites, selections, the reports queue, appeals, the blocklist, link verdicts and the audit log. The access gate in front of the admin host signs the operator in. |
| `/edit` | Local editor | The same editor against `link-in-bio serve --mode local` on this computer. It is also what `/` shows on a loopback host whose server is the loopback editor. |

- **Same origin.** The app calls `/api/v1` on its own host only, with the session cookie the browser holds (`credentials: 'same-origin'`);
  every write carries `X-Link-In-Bio-Request: 1` (and, for the loopback editor, `X-Link-In-Bio-Editor: 1`). While paying, the Chain
  Payments widget calls the Chain Payments public origin and the wallet's transaction goes through the Sui full node: the CSP's
  `connect-src` is `'self'` plus exactly those two origins, given as build arguments.
- **No operator data in the bundle.** The product name, the hosts, the price, the sign-up mode and the Sui network come from
  `GET /api/v1/instance` at run time; the terms and privacy links are build arguments.
- **The preview cannot reach the app.** It is a frame with `sandbox=""`: no scripts and an opaque origin.
- **Not for search engines.** `robots.txt` disallows everything; the page carries `noindex`.

## Build-time configuration

| Build argument | Default | Meaning |
| --- | --- | --- |
| `VITE_TERMS_URL` | unset | the terms (sign-up and the footer); no link when unset |
| `VITE_PRIVACY_URL` | unset | the privacy notice (the footer); no link when unset |
| `CHAIN_PAYMENTS_ORIGIN` | unset | the Chain Payments public origin (`https://…`), added to `connect-src` |
| `SUI_RPC_ORIGIN` | unset | the Sui full node origin the wallet adapter uses for the instance's network (`https://…`), added to `connect-src` |

## Development

```bash
npm ci
npm run dev            # /api and /_/ proxied to LINK_IN_BIO_API (default http://127.0.0.1:8080)
npm run type-check && npm run lint && npm test && npm run build && npm run check:csp && npm run check:dist
npx playwright install chromium && npm run test:e2e     # the e2e build in a browser, against a fake service
npm run shots          # screenshots to test-results/shots, for looking
```

**Chain Payments packages.** `@meddleware/chain-payments-client` (`^0.0.1`) and `@meddleware/chain-payments-kit` (`^0.0.2`) come from npm.

## Tests

| Kind | Where | What |
| --- | --- | --- |
| Unit | `tests/http.test.ts` | the request header on writes only, same-origin relative URLs, the one error type (`{error, code, issues}` and the loopback editor's `{ok, errors}`), every typed route |
| Unit | `tests/webauthn.test.ts` | base64url, the browser's JSON parsers when present and the converter otherwise, credential JSON |
| Unit | `tests/model.test.ts` | the page document: add, remove, reorder, write back, issues placed on fields by link id |
| Unit | `tests/checkout.test.ts` | following a checkout (paid, expired, retries, timeout, abort) and reading each kind of checkout |
| Component | `tests/edit-mode.test.ts` | the local editor asks the loopback origin's editor routes only, and nothing else |
| Component | `tests/views.test.ts` | the hosted editor, each checkout kind, the report form, the console gate and reports queue, recovery codes, sign-up |
| Browser | `e2e/app.spec.ts` | sign-up with a virtual authenticator (Chromium), wallet sign-in, the editor round trip, validation, keyboard reorder, the sandboxed frame, the report form, billing, the console, phone width |
| Browser | `e2e/app.spec.ts` | the local editor in a real browser: every request it makes is recorded, and each is a loopback editor route on the page's own origin |
| Accessibility | `e2e/a11y.spec.ts` | the shared sweep with AAA gating over 26 states: sign-in, sign-up, the recovery codes, the editor, billing, each checkout kind (crypto price and fee, provider page, bank transfer, Open Payments), account, the report form and its confirmation, the local editor, the service down, the console's gate answers and every console section |
| Build | `scripts/check-dist.mjs`, `tests/dist.test.ts` | no fake service, mock wallet or test runner in `dist`; `noindex`; the icon set; no third-party load |

## Licence

0BSD — see [LICENSE](LICENSE).
