# CLAUDE.md — link-in-bio-ui

The user interface of the hosted Link in Bio service. See [README.md](README.md) and the service's
[HOSTED.md](https://github.com/meddleware-org/link-in-bio-service/blob/main/docs/HOSTED.md).

## Invariants

- **Display and input only.** The service decides whether a page document is valid, what a link's screening says, what may be bought
  and who may do what. The app shows what it says (`issues` next to fields, `notes`, statements) and never treats its own checks as the
  answer.
- **Same origin, no credentials.** Requests go to relative `/api/v1/…` paths with `credentials: 'same-origin'`; this code never reads,
  stores or sends a token. Every write carries `X-Link-In-Bio-Request: 1` (`src/api/http.ts`); the loopback editor's writes also carry
  `X-Link-In-Bio-Editor: 1`.
- **The local editor is loopback only.** The editor takes its data source as an interface (`src/editor/source.ts`: hosted or local); in
  edit mode it makes no request but to the loopback origin's editor routes (`tests/edit-mode.test.ts`).
- **The preview frame has no permissions.** `sandbox=""` (no `allow-scripts`, no `allow-same-origin`). Never add a token to it.
- **Untrusted text is text.** No `v-html`; a statement, a report or a link title is rendered as text. Links bind through `safeHref`.
- **No operator data** in the repository: no hosts, prices or handles; the instance (`GET /api/v1/instance`) gives them at run time, and
  the terms, privacy and CSP origins are build arguments without defaults. Examples use example.org / example.link.
- Fleet UI rules: semantic markup (native elements, `<label>` wrapping where valid), no inline styles, design-token colours only
  (`tests/design-tokens-used.test.ts`), html-validate and the a11y lint gate, WCAG 2.2 AA everywhere and AAA gating in the sweep, no test
  hooks in the production build.

## Where things are

- `src/api/` — `http.ts` (the only network code), `errors.ts` (`ApiError` carrying `{error, code, issues}`; `describeError` for people),
  `types.ts` (the service's JSON), `app.ts` and `admin.ts` (one typed function per route), `webauthn.ts` (WebAuthn JSON ↔ ArrayBuffers:
  the browser's parsers and `toJSON()` when present, a base64url converter otherwise).
- `src/editor/` — `model.ts` (the page document: normalise, add, remove, move, write back, issues placed by link id), `source.ts` (the
  hosted and local data sources), `PageEditor.vue` with `LinkFields.vue` and `GroupFields.vue` (they share the document through
  `context.ts`).
- `src/views/app/` — `AppArea.vue` (instance, who is signed in, the tabs), `SignInView`, `SignUpView`, `PageView` (publishing, versions,
  the editor), `BillingView`, `AccountView`. `src/components/CheckoutPanel.vue` handles each checkout kind; `src/lib/checkout.ts` reads
  the provider's `client` object (`planCheckout`) and follows a checkout (`pollCheckout`).
- `src/views/ReportView.vue`, `src/views/LocalEditView.vue`, `src/views/console/` (the console: one section per tab).
- `src/route.ts` (the four areas by path, and the loopback check), `src/LinkInBioView.vue` (the app, exported), `src/App.vue` (the
  shell), `src/main.ts`, `src/e2e.ts` (the e2e build's mock wallet; only in `--mode e2e` with `VITE_E2E=1`), `src/wallet.ts` (the
  shared wallet adapter), `src/config.ts` (build arguments).
- `tests/` (unit and component; `tests/support/fake-service.ts` is test support only) and `e2e/` (`open.ts` wires the fake service into
  the browser, `app.spec.ts` the flows, `a11y.spec.ts` the shared sweep, `screens.spec.ts` the screenshots).

## Shell

`App.vue` is `<AppToolShell :contained="false">`: the title is the instance's product name (the generic "Link in Bio" until it
arrives); no documentation or developer link; the footer note (`FooterNote.vue`) on every area but the console. Each area sets its own
width. `meddlewareApp` emits the brand icon set; `index.html` keeps `noindex`.

## Chain Payments packages

`@meddleware/chain-payments-kit` (`^0.0.2`) and `@meddleware/chain-payments-client` (`^0.0.1`) come from npm. `vite.config.ts` and
`vitest.config.ts` dedupe Vue, `@meddleware/ui` and the Sui SDK, so the bundle carries one copy of each.

## Looking at it

`npm run shots` writes a PNG per state × viewport × colour mode (× season at desktop) to `test-results/shots/`: open them and look.

## Tests

`npm test` (vitest): the API layer, WebAuthn, the document model, checkouts, the loopback-only guarantee, the views against the fake
service. `npm run test:e2e` (Playwright, the e2e build in `dist-e2e/`, production CSP, the fake service): flows, a virtual authenticator
(Chromium only), and the shared accessibility sweep. axe cannot run inside the script-less preview frame, so the sweep's editor state
removes it and `app.spec.ts` checks the editor with the frame (axe excluding it, and the keyboard pass). `E2E_BROWSERS=all` runs five
browsers. `npm run check:dist` fails if test support reaches `dist`.

## Commands

```bash
npm ci && npm run type-check && npm run lint && npm test && npm run build && npm run check:csp && npm run check:dist && npm run check:licenses
npx mw-sync --check
npx playwright install chromium && npm run test:e2e    # E2E_BROWSERS=all for five browsers
npm run shots
docker build -t link-in-bio-ui:ci . && bash scripts/smoke.sh link-in-bio-ui:ci
```

## Interoperability

- [docs/INTEROP.md](docs/INTEROP.md): the standards this project speaks, what is planned, where to extend it, and what proves each claim.
