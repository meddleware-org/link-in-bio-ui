# Security Audit — `link-in-bio-ui`

**Classification:** Internal security review (first pass, awaiting external review)
**Project:** link-in-bio-ui  (`@meddleware/link-in-bio-ui`: the Link in Bio app — sign-up and sign-in with a passkey, a Sui wallet or a
  recovery code, the page editor with its sandboxed preview, billing and checkout, the account — plus the report form, the operator
  console and the local editor; a static Vue SPA, also exported as `LinkInBioView`)
**Project type:** Vue app (static image) + UI library export (not published to npm)
**Template:** AUDIT_TEMPLATE.md (2026-11-01) + AUDIT_TEMPLATE_VUE.md (2026-11-01) + AUDIT_TEMPLATE_A11Y.md (2026-11-01) +
  AUDIT_TEMPLATE_TS.md (2026-11-01) + AUDIT_TEMPLATE_IMG.md (2026-10-08) + AUDIT_TEMPLATE_SUI_CLIENT.md (2026-10-08, the
  signing-flow, network-binding and chain-access rows: the app builds no transaction). AUDIT_TEMPLATE_AUTH.md is not triggered: the app
  issues, verifies and holds no credential (the session cookie is HttpOnly and the service's; the console's session is Cloudflare
  Access's); it only runs the browser's WebAuthn ceremony and asks the wallet to sign the service's message.
**Deployment status:** image `quay.io/meddleware-org/link-in-bio-ui:0.0.1` deployed digest-pinned (`sha256:6393f0a7…f165f`,
  `config/images.yaml`; `post-bootstrap/link-in-bio/hosted/ui-deployment.yaml`, testnet, sign-up closed). `package.json` 0.0.2 is on
  `main` (02a4bac), not tagged; this pass's fixes go out with the next tag.
**Review date:** 2026-11-18
**Reviewer:** Internal review
**Severity ceiling:** Medium — the app starts payments and sends people to payment pages, holds the operator console's moderation
  forms, and renders other people's text. It decides nothing (every rule, price, permission and payment outcome is the service's or
  the chain's) and holds no credential, so a defect can mislead a person or misroute a navigation, not take money or an account.
  Realised ceiling at this pass: **Low** (no Medium finding).
**Status:** first-pass baseline

**Build tool:** vite 8.3.8, `@vitejs/plugin-vue` 6.0.11, vue 3.5.45 (`meddlewareApp` from `@meddleware/frontend-config` 0.0.11)
**Hosting:** container image on static-server 0.1.12 (`CONTENT_SECURITY_POLICY` from the Dockerfile `ARG CSP`); `vite preview`
  sends the same policy for the browser tests
**Embedding hosts:** none today (`LinkInBioView` is exported; a host must serve it on the app or admin host, `src/index.ts`)
**VITE_\* inventory:** `VITE_TERMS_URL` — terms link — baked — not per network — no ids · `VITE_PRIVACY_URL` — privacy link — baked —
  no · `VITE_E2E` — the e2e build's mock wallet, only with `--mode e2e` (`assertE2eOnlyInE2eMode` throws otherwise) — no ids. The
  Sui network, product name, hosts and price come from `GET /api/v1/instance` at run time.
**Images:** `quay.io/meddleware-org/link-in-bio-ui` and `docker.io/<ns>/link-in-bio-ui` (0.0.1, index digest above); self-hosted mirror
  best-effort
**Base images:** build `node:26-slim@sha256:0d1e3358…1dd4` ($BUILDPLATFORM) · runtime
  `quay.io/meddleware-org/static-server:0.1.12@sha256:f2cdfac6…052d`
**Runtime user:** 65534:65534   **Runtime FS:** read-only root (the Deployment and `scripts/smoke.sh`)
**Deployed by:** `post-bootstrap/link-in-bio/hosted/ui-deployment.yaml` via `overlays/default` (digest from `config/images.yaml`)
**Build args:** `VITE_TERMS_URL`, `VITE_PRIVACY_URL`, `CHAIN_PAYMENTS_ORIGIN`, `SUI_RPC_ORIGIN` (both origins checked to be a bare
  `https://` origin), `CSP` (derived) — none secret
**Package manager / lockfile:** npm 12 (Node 26 in CI), `package-lock.json` committed, `npm ci` everywhere
**Module format / publish model:** ESM; not published (an image only; `"private": true`)
**Runtime targets / peer dependencies:** browser / none
**Sui SDK / transport:** `@mysten/sui` 2.39.1 (one copy, `npm ls`), gRPC through `@meddleware/wallet-adapter` 0.0.23; no JSON-RPC
**Networks:** whichever the instance names (`suiNetwork`: testnet today); localnet only in development
**On-chain packages consumed:** `chain_payments` through `@meddleware/chain-payments-client` 0.0.1's built-in ids (`SUI_PACKAGES`,
  `SUI_PLATFORM_CONFIGS`; testnet `0x610cf31f…6af2`); the app holds no id of its own except the e2e fixture's copy, which
  `tests/e2e-fixture.test.ts` keeps equal to the client's
**Support promise:** `browserslist: extends @meddleware/frontend-config/browserslist-config` (0.0.11); eslint-plugin-compat and the
  stylelint compat rule from the shared configurations
**Accessibility gates:** axe AA **and AAA gated** (`aaa: 'gate'`) in every colour mode × season, plus reflow at 320 px, 200 % text,
  forced colours, reduced motion and the keyboard pass, over **26 states** (9 before this pass, F7); five browser projects in CI
  (`E2E_BROWSERS=all`); Lighthouse accessibility 100 (`lighthouserc.cjs`)
**Known exceptions:** the preview frame is removed from the page before the sweep in the `editor` and `local editor` states (axe
  injects a script into every frame and a `sandbox=""` frame runs none, so the run never ends); `app.spec.ts` checks the editor with
  the frame present (axe excluding it, and the keyboard pass), and the frame's content is the service's renderer, swept in the service.

---

## Executive summary

The app is a display-and-input layer over the same-origin Link in Bio API. `src/api/http.ts` is its only network code: relative
`/api/…` paths, `credentials: 'same-origin'`, `redirect: 'manual'`, `X-Link-In-Bio-Request: 1` on every write and no token.
Nothing a person typed is rendered as markup (no `v-html` anywhere), every dynamic link goes through `safeHref` or `safePath`, the
preview is a frame with `sandbox=""`, and the CSP allows `connect-src` to this origin, the Chain Payments origin and the Sui full node
only. The Chain Payments kit shows the amount, the network and the platform fee read from the chain before the wallet opens; the app
builds no transaction. The console relies on Cloudflare Access and has no sign-in of its own; operator data never reaches the app area.

**Fixed inline (9):**

- F1 — requests now have a 30-second deadline (TS-M5).
- F2 — payment-page redirects are https only (`httpsHref`); the Open Payments refusal is said in words.
- F3 — the console no longer calls an edge error page "sign in", and no longer calls every 503 "not configured".
- F4 — the kit's failure codes (`rejected`, `unapplied`) are no longer shown as bare words.
- F5 — the uploaded picture's URL passes `safePath`/`safeHref` before it reaches `<img src>`.
- F6 — the image build runs the production-bundle scan, as CI does.
- F7 — the sweep covers 26 states (was 9): the local editor, the recovery codes, the service down, four checkout kinds, the report
  sent, the console's gate answers and every console section.
- F8 — a real-browser test records every request the local editor makes.
- F9 — stale comments about sibling `file:` links.

**Deferred (5):**

- F10 — the checkout's network binding: build-time CSP origin vs run-time instance network vs the quote's network (FU-0144).
- F11 — minimatch GHSA-g3hv-75wg-m249, dev-only; the override is verified, but the lockfile change was refused here (FU-0145).
- F12 — the UI Deployment has no liveness probe (FU-0146).
- F13 — Dependabot #3, #4 and #6 wait for frontend-config's peer ranges (FU-0147).
- F14 — the manual accessibility review (screen reader, 44 px targets) is not recorded (FU-0148).

**Dispositions (27 findings):** RESOLVED 9 · DEFERRED 5 · ADJUDICATED 4 · Positive 9.
**Counts by severity:** Low 12 · Info 6 · Positive 9.

## Threat model / trust boundaries

Primary trust anchor: the Link in Bio service (same origin), which decides every rule. The chain (through the Move package) decides
what a crypto payment is; Cloudflare Access with the Keto role decides who is an operator.

| Actor | Holds / proves | Can do | Bounded by |
| --- | --- | --- | --- |
| Visitor / account holder | the session cookie (HttpOnly, `__Host-`, SameSite=Strict), a passkey, a wallet, recovery codes | edit and publish their page, pay, manage the account | the service (CSRF: `Origin` + `X-Link-In-Bio-Request`); the app only shows what the service says |
| Another account holder (page author) | text and URLs on their page, reported links | reach operators (reports, appeals) and visitors | text interpolation (F19); the preview frame (F20); the service's screening |
| Anonymous reporter | the report form | send a report about any page | text only; the service's rate limits |
| Operator | the Access session (MFA) and the Keto role | moderation, suspensions, grants, invites, refunds | Access + Keto on every admin request (service); no credential in the app (F25) |
| Link in Bio service | every answer | what the app shows and where payment redirects point | same origin; `planCheckout` reads every field; `httpsHref` on redirects (F2) |
| Chain Payments service | session, quote, payment status | what the kit shows | the client SDK's validation; the Move package checks the signed quote |
| Sui full node | object reads (the platform fee), execution | what the fee line says | the wallet adapter's chain-id check; CSP origin (F10) |
| Wallet extension | accounts, signatures | sign the service's message or the kit's transaction | the person's own approval; required features; the account's chains (wallet adapter) |
| Payment providers / Open Payments wallets | their pages | where the browser goes after "Continue" | https only (F2); full-page navigation, never a frame |
| Build environment | `VITE_*`, the origins, the build mode | what is baked into the bundle and the CSP | origin format check; `assertE2eOnlyInE2eMode`; `check-dist` in CI and the image (F6, F26) |

### Frontend actor matrix (VUE lens)

| Actor | What it controls | Bounded by |
| --- | --- | --- |
| End user + wallet extension | inputs, wallet account and network, signing | the kit's quote box (amount, network, fee); the wallet adapter's chain checks (F23, F24) |
| Embedding host | none today | `LinkInBioView` takes `fetch`, `start`, `hostname` only; scoped styles |
| Authors of rendered data — page owners (titles, URLs, bio), reporters (details), appellants, the service's statements | text and URLs shown to people and operators | interpolation only; links through `safeHref`; the console shows reported URLs as text, not links (F19) |
| Relays / RPC | the platform fee read | the kit and client; CSP `connect-src` |
| Static host | headers | B.VUE-1 (F22) |
| Other embedded views sharing the wallet | none (one app) | — |
| Build environment | `VITE_*`, build mode, CSP origins | B.VUE-2 |

### On-chain dependency matrix (Sui client lens)

| Object / package | ID (testnet) | Sourced from | Used as | If stale or wrong | Fails |
| --- | --- | --- | --- | --- | --- |
| `chain_payments` package | `0x610cf31f…6af2` | `@meddleware/chain-payments-client` `SUI_PACKAGES` (the client refuses a quote naming another) | call target of the client's builder | the client refuses the quote; nothing is signed | closed |
| `PlatformConfig` | `SUI_PLATFORM_CONFIGS.testnet` | the client | the fee line before signing | the read fails; the kit refuses to sign | closed |

### Who is excluded, and by what (A11Y lens)

| Actor / source | What it controls | Bounded by |
| --- | --- | --- |
| Assistive technology and settings | perception and operation | the shared sweep over 26 states (AAA gated); live regions (`UiLiveStatus`) for loading, saving, moves and payments; focus moved to the issue summary on a refused save |
| A visitor's browser | features | the shared browserslist; compat lints; passkeys fall back to wallet or recovery code where WebAuthn is missing |
| Tokens | contrast | `@meddleware/design-tokens` only (`tests/design-tokens-used.test.ts`) |
| Shared components (`@meddleware/ui`, wallet-adapter dialog, the kit) | focus, labels, busy states | their own audits; composed pages swept here |
| Content (handles, titles, bank details, references, reports) | length | `overflow-wrap: anywhere`; the reflow and 200 % states with the fake service's longest content |

## Severity scale

Critical / High / Medium / Low / Info / Positive (unchanged across the corpus).

## Scope

**In scope (`main` = `02a4bac` plus this pass's changes):** `src/**` (API layer, areas, editor, checkout, console, wallet, config,
router, e2e entry), `tests/**`, `e2e/**`, `scripts/{check-dist.mjs,smoke.sh}`, `Dockerfile`, `.dockerignore`, `.env.example`,
`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `.github/workflows/{node-ci,docker-publish}.yml`,
`.github/dependabot.yml`, `.github/audit-allowlist.json`, `package.json`, `package-lock.json`, `SECURITY.md`, `README.md`, `CLAUDE.md`;
the deployment manifest `post-bootstrap/link-in-bio/hosted/ui-deployment.yaml` (read only) and the open Dependabot PRs #1–#6.

**Out of scope:** link-in-bio-service (its own audit, including the preview route's own headers and the ingress); the Chain Payments
kit, client and Move package (their audits); `@meddleware/ui`, wallet-adapter, web-utils and frontend-config (their audits).

**Environment / commands (2026-11-18, Node 26.13, npm 12.2.1):**

| Command | Result |
| --- | --- |
| `npm run -s lint` (stylelint, eslint with vuejs-accessibility, html-validate) | clean |
| `npm run -s type-check` (`vue-tsc`) | clean |
| `npx vitest run` (with `REQUIRE_DIST=1` after a build) | **130 passed** (9 files; 123 before this pass) |
| `npm run -s build`, `check:dist`, `check:csp` | built; 71 files, no test support, `noindex`; every inline script allowed |
| `FONTCONFIG_FILE=… npx playwright test` (Chromium, DejaVu Sans as `sans-serif`/`system-ui`) | **406 passed** (150 before this pass) |
| `npx mw-audit-gate` | 1 high advisory, allowlisted (picomatch GHSA-fc5q-39xc-vjpf, expires 2027-01-31) |
| `npx mw-sync --check` | every synced file matches its template |
| `npm ls @mysten/sui vue @meddleware/ui` | one copy each |

## Findings

### F1 — Requests had no deadline

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `src/api/http.ts` `createHttp`.
**Issue:** TS-M5: every network call has a timeout. `fetch` was called without a signal, so a stalled connection (a half-open tunnel,
an overloaded node) left a button busy for ever.
**Impact:** A person could not tell a stalled save, sign-in or payment-start from a slow one; nothing was lost, but nothing ended.
**Remediation / evidence:** Every request carries `signal: AbortSignal.timeout(timeoutMs)` (`DEFAULT_TIMEOUT_MS` = 30 s, `timeoutMs`
in `HttpOptions`). An expired deadline ends as `ApiError(0)`, "The server could not be reached". Test: `tests/http.test.ts` *gives
every request a deadline*. The checkout follower is a loop of short GETs, so it is unaffected.

### F2 — A provider's payment page could be a plain-http loopback URL; the Open Payments refusal was not said

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `src/lib/checkout.ts` `planCheckout` (`redirect`), `src/components/CheckoutPanel.vue` `toWallet`.
**Issue:** The provider redirect passed `safeHref`, which also allows `http://localhost` and `http://127.0.0.1` for development
links. The requirement is that the browser is sent away to a payment page over https only. The Open Payments path did check
`https://`, but it threw a plain `Error`, which `describeError` turns into "Something went wrong", so the reason was lost.
**Impact:** A misconfigured or compromised provider adapter could send a person to a plain-http page on their own machine. The
service is trusted and same-origin, so this is defence in depth.
**Remediation / evidence:** New `httpsHref` (`safeHref`, then https only) for the provider page and the Open Payments approval page.
The Open Payments refusal now sets the field's error: "Your wallet did not give an https address to approve the payment at, so this
page did not go there." The Chain Payments `baseUrl` keeps `safeHref`, because the client accepts loopback http for development and
it is not a navigation. Tests: `tests/checkout.test.ts` *a provider's page* (localhost, 127.0.0.1 and http refused) and *httpsHref*;
`tests/views.test.ts` *Open Payments: a wallet that answers with a non-https approval address is not followed, and says why*.

### F3 — The console's error states named the wrong cause

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `src/views/console/ConsoleArea.vue` (the gate), `src/api/errors.ts` `signedOut`.
**Issue:** Any non-JSON answer (`not_json`) went to "Sign in through your access gate", including a 502 or 504 HTML page from the
ingress or the tunnel. Every 503 went to "The console is not configured". The service's admin middleware answers 503 both when Access
is not configured and when the JWKS, Keto or the database are down (`crates/api/src/hosted/access.rs`).
**Impact:** During an outage an operator was told to sign in again, or that the console was not set up. They would chase the wrong
cause while moderation waited.
**Remediation / evidence:**

- Sign-in is shown only for 401 or 403. A redirect, or the gate's HTML sign-in page answering 200, is given status 401 by the HTTP
  layer, so both still reach it.
- A 503 shows "The console is not available", explains both causes, quotes the service's own words and offers Reload.
- Any other failure, an edge error page included, is shown as the error it is.
- `ApiError.signedOut` is now `status === 401`, so an HTML error page is not "signed out".

Tests: `tests/views.test.ts` (the 401/403/503 table, and *a 503 passes on the service's words …; an HTML error page from the edge is
an error*); `tests/http.test.ts` (502 HTML is not signed out); `e2e/app.spec.ts` *the console says what to do …* (403, 503, 502).

### F4 — The kit's failure code was shown as a bare word

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `src/components/CheckoutPanel.vue` (`@failed`).
**Issue:** `ChainCheckout` emits `failed` with `rejected` or `unapplied` and shows its own explanation for each. The panel also showed
the raw code in an error notice ("rejected"), and called an `unapplied` payment an error.
**Impact:** A confusing, duplicated message right after a payment, at the moment a buyer most needs clear words (VUE §A *Signing UX*:
failures show the mapped meaning, not raw text).
**Remediation / evidence:** `kitFailed` adds nothing for the two reasons the kit explains. For any other reason it says "The payment
did not complete. Check your wallet's history before you try again." Test: `tests/views.test.ts` *Chain Payments: a payment that
did not count is the kit's to explain*.

### F5 — The uploaded picture's URL reached `<img src>` unchecked

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `src/editor/source.ts` `hostedSource.uploadAvatar` → `PageEditor.vue` `avatarUrl`.
**Issue:** VUE-M1: every dynamic URL sink is allowlisted. The service's `url` was bound as it came.
**Impact:** Small: the service is same-origin, and the CSP limits `img-src` to `'self' data:`. A tracking or `javascript:` URL could
still have reached the attribute.
**Remediation / evidence:** `safePath(r.url) ?? safeHref(r.url) ?? null`: a path on this site (what the service sends) or an https
URL, otherwise no picture. Test: `tests/http.test.ts` *the hosted editor source* (`javascript:`, `//host`, `data:` and empty refused).

### F6 — The image build did not scan the production bundle

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `Dockerfile` (build stage).
**Issue:** Base §B.2 *Test-only modes* and VUE §A *Test hooks*: the production artefact is scanned for test support **in CI and in
the image build**. CI ran `npm run check:dist`; the Dockerfile ran only the build, the licences and the CSP inline-script check.
**Impact:** None today: the image builds from a clean `npm ci` with no `VITE_E2E`, and the release job runs CI first. But the gate the
lens names was missing from the artefact that ships.
**Remediation / evidence:** `RUN npm run build && npm run licenses && npm run check:dist`. Test: `tests/dist.test.ts` *the image build
scans the production bundle for test support* (it also holds the CSP check in place). The CI `image` job builds the Dockerfile.

### F7 — The accessibility sweep covered 9 of the app's states

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `e2e/a11y.spec.ts`.
**Issue:** A11Y §A *Conformance gate*: every state a visitor can reach is swept. The sweep had sign-in, sign-up, editor, billing,
account, report, and three console sections. It did not have:

- the local editor;
- the one-time recovery codes;
- the app when the service is down;
- the four checkout kinds (crypto quote with the fee, provider page, bank transfer, Open Payments with a refused address);
- the report confirmation;
- the console's gate answers (sign-in, unavailable);
- seven console sections: an open account, invites, selections, appeals, blocklist, link verdicts and the audit log.

**Remediation / evidence:** Seventeen states added, each with its busiest content (26 states in all). Each one runs AA + AAA in ten
looks, plus reflow, 200 % text, forced colours, reduced motion and the keyboard. All pass on Chromium with the CI font
(406 tests). CI runs them on five browser projects. The recovery-code state signs up with the mock wallet, so it runs in every
browser; the passkey path stays Chromium-only in `app.spec.ts`.

### F8 — The local editor's loopback-only guarantee was proven only in jsdom

**Severity:** Low   **Disposition:** RESOLVED
**Where:** `tests/edit-mode.test.ts`; `e2e/app.spec.ts`.
**Issue:** The unit test is real: it injects a recording `fetch`, stubs the global `fetch` to fail, and checks every URL against the
editor's routes. But it mounts `LinkInBioView` in jsdom, so it cannot see requests that do not go through `fetch`: the shell, images,
frames, stylesheets or a library's own loads.
**Remediation / evidence:** New browser test *the local editor in a real browser asks nothing of any origin but its own, and only its
editor routes*. It records every request with `page.on('request')` through load, save and preview refresh, and asserts:

- every request (other than `data:`) has the page's origin;
- every API path is one of the editor's routes;
- the service never sees `/api/v1/instance`, `/api/v1/me*` or `/api/v1/page`;
- the srcdoc preview has `sandbox=""`.

### F9 — Comments described dependencies that no longer exist

**Severity:** Info   **Disposition:** RESOLVED
**Where:** `Dockerfile` header, `vite.config.ts`, `vitest.config.ts`, `.github/workflows/node-ci.yml` (install step, and "Install
Chromium" for a step that installs three browsers), `CLAUDE.md` ("Dependencies not yet on npm"), `README.md` (kit `^0.0.1`).
**Issue:** TS §A *Accurate comments*. They said the Chain Payments packages were linked from sibling `file:` directories and that CI
could not install. Both packages have come from npm since 0.0.1.
**Remediation / evidence:** The texts now describe the npm dependencies (kit `^0.0.2`, client `^0.0.1`) and why the shared libraries
are deduplicated. The step is named "Install the browsers (Chromium, Firefox, WebKit)".

### F10 — The checkout's network is bound in three places that nothing compares

**Severity:** Low   **Disposition:** DEFERRED (FU-0144)
**Where:** `src/views/app/AppArea.vue` (`useNetwork().setNetwork(instance.suiNetwork)`); the Dockerfile's `SUI_RPC_ORIGIN` (a build
argument in `connect-src`); the quote's `method.network` (Chain Payments session); `ChainCheckout` (no network prop).
**Issue:** SC §A *Network / chain binding* asks that one network value select the ids, the RPC client and the wallet chain, with no
build-time/run-time split. Here there are three sources:

- the wallet adapter's network comes from the instance at run time;
- the full node origin the CSP allows is fixed at build time;
- the network the quote is for comes from the Chain Payments session.

Each pair can disagree. The kit's audit F3 left the binding to this host, and this host does not compare them.
**Impact:** Every mismatch fails closed, so no funds move:

- if the CSP origin is wrong, the platform-fee read is blocked and the kit refuses to sign;
- if the wallet network is wrong, the executor's account-chain and RPC chain-id checks refuse, or the fee object does not exist there.

But the buyer sees a network error rather than "this checkout is for Sui testnet, the app is on mainnet". The image must also be
rebuilt whenever the instance changes network.
**Remediation / evidence:** Tracked in FU-0144:

- `ChainCheckout` takes an optional `network` and blocks **Pay** with a sentence when the quote's network differs (the kit audit's
  suggestion); this app passes `instance.suiNetwork`;
- the deployment sets `CONTENT_SECURITY_POLICY` from the same value the instance uses (static-server reads it at run time), or the
  S7 go-live checklist rebuilds the image with the mainnet origin in the same change as `SUI_NETWORK`;
- a browser test with a testnet quote on a mainnet instance shows the sentence and never calls the wallet.

### F11 — minimatch ReDoS (GHSA-g3hv-75wg-m249) in dev tooling

**Severity:** Low   **Disposition:** DEFERRED (FU-0145)
**Where:** `@vue/test-utils` 2.6.0 → `js-beautify` 2.0.3 → `editorconfig` 3.0.2 and `glob` 13.0.7 → `minimatch` 10.2.6
(`>=7 <11.0.1` is affected); Dependabot alert 2.
**Issue:** A high advisory in a test-only transitive. It formats `wrapper.html()` in component tests and matches the repository's own
`.editorconfig` globs; nothing of it ships. `mw-audit-gate` does not flag it at the review date, but Dependabot does.
**Impact:** None at run time. A crafted glob could slow a test run.
**Remediation / evidence:** A scoped override, `"overrides": { "js-beautify": { "minimatch": "^11.0.9" } }`, dedupes both paths to
the top-level `minimatch` 11.0.9. Checked in a scratch copy:

- the lockfile change is only the removal of the two nested 10.2.6 entries;
- `js-beautify` 2.0.3 reads `.editorconfig` and formats HTML with minimatch 11.0.9.

Changing `package.json` and `package-lock.json` was outside this pass's brief, and the classifier refused it. The exact steps are in
FU-0145.

### F12 — The UI Deployment has a readiness probe but no liveness probe

**Severity:** Low   **Disposition:** DEFERRED (FU-0146)
**Where:** `post-bootstrap/link-in-bio/hosted/ui-deployment.yaml` (workspace).
**Issue:** IMG §A *Health & resources*: liveness and readiness probes exist. Only `readinessProbe` (`GET /`) is set. access-gate-ui,
landing-site and dev-site also set `livenessProbe` (`GET /`, `initialDelaySeconds: 5`, `periodSeconds: 20`).
**Impact:** A wedged static-server would stay out of the Service but would never be restarted.
**Remediation / evidence:** Add the probe in the workspace overlay and deploy it with `kubectl diff`/`apply`. That is a deployment
step, and another workstream is editing the same feature directory at the same time, so it is FU-0146 rather than an edit here.
Everything else in the pod security context holds: `runAsNonRoot`, uid/gid 65534, `RuntimeDefault` seccomp, read-only root, no
privilege escalation, `ALL` capabilities dropped, `automountServiceAccountToken: false`, and requests and limits set.

### F13 — Three Dependabot updates wait for frontend-config's peer ranges

**Severity:** Info   **Disposition:** DEFERRED (FU-0147)
**Where:** PRs #3 (`@playwright/test` 1.65.1), #4 (`stylelint` 18) and #6 (`stylelint-config-standard` 41).
**Issue:** `@meddleware/frontend-config` 0.0.11 peers `@playwright/test ~1.64.1` and `stylelint ^17`.

- #4 and #6 fail `npm ci`.
- #3 installs, but against a violated peer range (TS-M9 forbids masking that).
- #1 (node base digest), #2 (`docker/login-action` 4.8.0) and #5 (jsdom 31) failed only because they are based on `04ce750`, before
  the allowlist entry. Their own steps (image build, install) passed.

**Impact:** None today; updates are delayed.
**Remediation / evidence:** FU-0147: widen the peers in frontend-config, release it, then bump the three together. The merge advice
for #1, #2 and #5 (rebase first) is in the pass report.

### F14 — The manual accessibility review is not recorded

**Severity:** Low   **Disposition:** DEFERRED (FU-0148)
**Where:** A11Y §C (what automation cannot decide).
**Issue:** Nothing records a screen-reader pass on the main flows (sign-up with the recovery codes, the editor with its reorder
announcements and issue summary, the crypto checkout's live region), a review of 44 px targets, or the link purposes, all against
the screenshots (`npm run shots`).
**Impact:** Automated AA/AAA cannot hear whether an announcement makes sense.
**Remediation / evidence:** FU-0148, a pre-mainnet gate. Run `npm run shots`, then NVDA + Firefox and VoiceOver + Safari over the
three flows. Record the date and the findings in this audit's log.

### F15 — `style-src 'unsafe-inline'`

**Severity:** Info   **Disposition:** ADJUDICATED
**Where:** `Dockerfile` `ARG CSP`.
**Issue:** Inline styles are allowed.
**Impact:** Styles only. `script-src 'self'` (plus static-server's nonce) has no `'unsafe-inline'`; `mw-check-csp-inline` fails the
build on an uncovered inline script; `smoke.sh` refuses a policy with inline scripts. Vue's style bindings and the shared components
need it. The fleet holds the same position (walrus-storage-ui audit, B.VUE-1).

### F16 — API answers are typed by cast, not validated field by field

**Severity:** Info   **Disposition:** ADJUDICATED
**Where:** `src/api/http.ts` (`return payload as T`).
**Issue:** TS §A *Runtime validation* asks that untrusted JSON be checked by shape and every field.
**Impact:** The answers come from the same-origin first-party service, so they are not untrusted input in the lens's sense. A
malformed answer can only break a view: every value is rendered as text, links pass `safeHref`, and payments are decided elsewhere.
The fields that steer a navigation or a payment are read field by field with fail-closed defaults: `planCheckout`, `httpsHref`,
`readIssues` and `describeError`. The OpenAPI snapshot in the service pins the shapes.

### F17 — `/edit` renders the local editor on any host

**Severity:** Info   **Disposition:** ADJUDICATED
**Where:** `src/route.ts` `areaFor`.
**Issue:** On the hosted app host, `/edit` shows an editor whose requests are refused.
**Impact:** None. Its requests are relative, so they go to the same origin, and the hosted service answers `no_route` for the
editor's routes. Restricting it to loopback hosts would break `link-in-bio serve --mode local` reached over a LAN address.

### F18 — The WebAuthn fallback converter spreads the service's options

**Severity:** Info   **Disposition:** ADJUDICATED
**Where:** `src/api/webauthn.ts` `creationOptions` / `requestOptions` (only when the browser has no `parse…FromJSON`).
**Issue:** TS §A prefers field-by-field copies to spreads.
**Impact:** The object is handed straight to `navigator.credentials`, which validates it. It comes from the same-origin service, and
the browser binds the ceremony to the origin and the RP id itself. Modern browsers take the native parsers. Missing binary fields
throw, so the fallback fails closed.

### F19 — Untrusted text and links

**Severity:** Positive
**Where:** every template (`grep v-html src` finds nothing); `src/config.ts`, `PageView.vue`, `AppArea.vue`, `lib/checkout.ts`,
`editor/source.ts`.

- Titles, bios, statements, reports, appeals, bank details and wallet addresses are interpolated text.
- Every dynamic `href` and `src` passes a helper:
  - the terms and privacy links: `safeHref ?? safePath`;
  - page URLs: `safeHref`;
  - payment pages: `httpsHref` (F2);
  - the picture: F5;
  - issue anchors: `#` plus an id the app generates.
- The console shows reported and screened URLs as text, never as links, so an operator cannot be sent to a phishing page by a click.
- The service refuses a page link that is not `https:` or `mailto:`, and the editor shows that next to the field
  (`edit-mode.test.ts`, `app.spec.ts` *validation*).

### F20 — The preview frame has no permissions

**Severity:** Positive
**Where:** `src/components/PreviewFrame.vue`.
`sandbox=""`: no `allow-scripts`, no `allow-same-origin`, no top navigation, no pop-ups. It also has `referrerpolicy="no-referrer"`.

- The hosted preview is a same-origin `src`, loaded in an opaque origin.
- The local preview is `srcdoc`, which inherits the app's CSP.
- Tests: `app.spec.ts` *the frame has no permissions* (`[...f.sandbox]` is empty), *the editor round trip*, the new local-editor test,
  `views.test.ts` and `edit-mode.test.ts`.
- `CLAUDE.md` forbids adding a token.

### F21 — Same origin, CSRF header on every write, no credential

**Severity:** Positive
**Where:** `src/api/http.ts`.
Relative `/api/` URLs only: `url()` throws otherwise. Requests carry:

- `credentials: 'same-origin'`;
- `redirect: 'manual'` (an access gate's redirect is never followed across origins);
- `cache: 'no-store'`;
- `X-Link-In-Bio-Request: 1` on every non-GET, plus `X-Link-In-Bio-Editor: 1` on loopback writes;
- no `Authorization` header.

Tests: `http.test.ts` (writes only, no token, relative URLs); `views.test.ts` `writesCarryTheHeader` after the editor, report and
console flows; `edit-mode.test.ts`. The service checks `Origin` as well (`crates/api/src/hosted/app.rs`, `access.rs`).

### F22 — One CSP on both hosting paths, with exactly three connect origins

**Severity:** Positive
**Where:** `Dockerfile` `ARG CSP`; `vite.config.ts` `imageCsp()`; `scripts/smoke.sh`; `e2e/open.ts`.

- `default-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self' ${CHAIN_PAYMENTS_ORIGIN} ${SUI_RPC_ORIGIN};
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`.
- The build refuses an origin argument that is not `^https://host(:port)?$`, so a path, a space or a `;` cannot add a directive.
- `vite preview` reads the same string from the Dockerfile, dropping only `upgrade-insecure-requests` for plain http. The browser
  tests therefore run under the production policy, and any CSP console message fails them (`problems`).
- `smoke.sh` probes the running image:
  - `connect-src 'self'` plus at most the https origins;
  - the nonce;
  - no inline scripts;
  - nosniff, `X-Frame-Options`, `Referrer-Policy`, HSTS and `Permissions-Policy`.
- `tests/dist.test.ts`: no third-party loads and no unexpected hosts.
- F10 covers keeping the build-time Sui origin in step with the instance's network.

### F23 — The Chain Payments kit: the platform fee before signing, and no transaction built here

**Severity:** Positive
**Where:** `src/components/CheckoutPanel.vue`; kit 0.0.2 `ChainCheckout.vue`.

- The app passes the session id, the origin from `planCheckout`, the wallet adapter's `getSuiClient()` and `signAndExecute`.
- Before the wallet opens, the kit shows:
  - "Pay exactly …";
  - "Platform fee (included) … to the platform (treasury …)", read from the chain at quote time and again just before signing; if the
    read fails, nothing is signed;
  - the network;
  - the hold countdown.
- `e2e/app.spec.ts` *billing* asserts the fee line (0.011084426 SUI on the stub `PlatformConfig`, 20 bps) before **Pay**.
- The app has no `Transaction` and no `moveCall` (chain-access layering).
- A signed payment survives a reload (the kit's `sessionStorage`, F2 of the kit audit, fixed in 0.0.2).
- "Paid" comes from the service: `pollCheckout` until the checkout is no longer open.

### F24 — Wallet sign-in signs the service's message; WebAuthn JSON goes both ways

**Severity:** Positive
**Where:** `src/views/app/{SignInView,SignUpView,AccountView}.vue`, `src/wallet.ts`, `src/api/webauthn.ts`.

- Wallet sign-in, sign-up and linking send the connected address. The wallet signs the service's own message as a personal message
  (the wallet shows it; it moves no coins). The service verifies the signature against the address it bound to the challenge, so an
  account switch in between fails closed.
- Only wallets with both `sui:signPersonalMessage` and `sui:signTransaction` are listed.
- WebAuthn:
  - the browser's `parseCreationOptionsFromJSON` / `parseRequestOptionsFromJSON` and `credential.toJSON()` are used where they exist;
  - otherwise a base64url converter that round-trips every byte and reads padded or standard base64;
  - `btoa` and `atob` see only byte strings.
- `webauthn.test.ts` covers both paths. `app.spec.ts` runs a real ceremony with a virtual authenticator and checks the shapes the
  service reads (`attestationObject` and `clientDataJSON` in base64url).

### F25 — The console relies on Access; operator data never reaches the app area

**Severity:** Positive
**Where:** `src/views/console/*`, `src/api/admin.ts`, `src/api/types.ts`, `src/App.vue`.

- No sign-in UI, password field or token in the console. Access (MFA) holds the session, and the service checks the Access JWT and the
  Keto role on every admin request.
- The console's API module is separate from the app's: `appApi` has no admin route, and `Me` / `Account` carry no operator fields.
- The app area never mounts a console component, and the footer note is hidden in the console.
- The admin host is routed only behind Access (`ingress.yaml`); the app host's ingress sends `/api/` to the app process.
- Error states: F3.

### F26 — Test support cannot reach production

**Severity:** Positive
**Where:** `src/main.ts`, `src/e2e.ts`, `vite.config.ts` (`meddlewareApp` → `assertE2eOnlyInE2eMode`), `scripts/check-dist.mjs`.
The mock wallet and stub chain load only when `MODE === 'e2e' && VITE_E2E === '1'` (both static). `VITE_E2E` outside `--mode e2e` is a
build error. `check-dist` fails on the fake service, the mock wallet hooks, the stub client, test runners and test globals, in CI and
since F6 in the image build. The e2e build goes to `dist-e2e/`, never `dist/`.

### F27 — CI, release and image integrity

**Severity:** Positive
**Where:** `.github/workflows/*`, `Dockerfile`, `.dockerignore`, `.github/dependabot.yml`.

- Workflows:
  - every Action is pinned by SHA;
  - `permissions: contents: read` by default, and `id-token`/`attestations: write` only on the merge-and-sign job;
  - the tag-triggered release runs `node-ci.yml` (the `verify` job), image build and probe included.
- What CI and the release check:
  - `npm ci`;
  - `mw-audit-gate` with the synced, expiring allowlist;
  - `mw-sync --check`;
  - lint, types, tests, the dist scan, licences, five-browser e2e and Lighthouse.
- Release outputs:
  - a Trivy scan before signing;
  - a keyless cosign signature at the index digest;
  - an SPDX SBOM attestation;
  - build provenance;
  - a mirror verified with a workflow-identity regexp (best-effort, `continue-on-error`, as IMG allows).
- Image build:
  - bases pinned by digest;
  - `.dockerignore` keeps out `.env*.local`, `node_modules`, `dist` and VCS data;
  - the lockfile is shipped outside the served directory for scanners;
  - `THIRD_PARTY_LICENSES` is served.
- Dependabot covers npm, docker and Actions.

## Section A — Invariant verification matrix

| # | Invariant | Enforced at | Proven by | Status |
| --- | --- | --- | --- | --- |
| I1 | Nothing a person typed is rendered as HTML | templates (no `v-html`) | inspection; html-validate; `views.test.ts` | HOLDS (code-only) |
| I2 | Every dynamic link and image URL passes an allowlist helper | `config.ts`, `PageView`, `AppArea`, `checkout.ts`, `source.ts` | `checkout.test.ts`, `http.test.ts` *the hosted editor source* (F5) | HOLDS |
| I3 | The browser is sent to payment pages over https only | `httpsHref` | `checkout.test.ts`, `views.test.ts` (F2) | HOLDS |
| I4 | The preview frame has no sandbox tokens | `PreviewFrame.vue` | `app.spec.ts` (tokens `[]`), `views.test.ts`, `edit-mode.test.ts` | HOLDS |
| I5 | Every write carries `X-Link-In-Bio-Request`; no token is sent | `http.ts` | `http.test.ts`, `views.test.ts` | HOLDS |
| I6 | Requests go to this origin's `/api/` only, with a deadline | `http.ts` `url()`, `AbortSignal.timeout` | `http.test.ts` (F1) | HOLDS |
| I7 | The local editor asks only its loopback origin's editor routes | `localSource`, `LocalEditView` | `edit-mode.test.ts`; `app.spec.ts` real-browser test (F8) | HOLDS |
| I8 | `connect-src` is `'self'` plus the Chain Payments and Sui node origins, on both hosting paths | `Dockerfile`, `vite.config.ts` | `smoke.sh`, e2e under the policy (F22) | HOLDS |
| I9 | The platform fee, amount and network are shown before the wallet signs | kit `ChainCheckout` | `app.spec.ts` *billing* (F23) | HOLDS |
| I10 | The wallet, the CSP origin and the quote agree on the network | — | — | GAP (fails closed; F10) |
| I11 | The console never shows a sign-in of its own; its gate states name the real cause | `ConsoleArea.vue` | `views.test.ts`, `app.spec.ts` (F3) | HOLDS |
| I12 | Operator data never appears in the app area | separate API modules and types | inspection; `http.test.ts` route table (F25) | HOLDS (code-only) |
| I13 | No test support in the production bundle or image | `main.ts` static gate, `assertE2eOnlyInE2eMode`, `check-dist` | CI step; Dockerfile (F6); `dist.test.ts` | HOLDS |
| I14 | Every reachable state passes the AA and AAA sweep | `e2e/a11y.spec.ts` (26 states) | 406 Chromium tests; CI five browsers (F7) | HOLDS |
| I15 | Liveness and readiness probes on the UI pods | `ui-deployment.yaml` | — | GAP (F12) |

## Section B — Supply-chain, publish-authority & capability matrix

### B.1 Dependency & CVE risk

| Dependency | Version (lockfile) | Paths / liveness | CVE / audit status | Notes |
| --- | --- | --- | --- | --- |
| `vue` | 3.5.45 | everything | clean | one copy |
| `@meddleware/ui`, `@meddleware/design-tokens` | 0.1.43, 0.1.13 | shell, components, tokens | their audits | |
| `@meddleware/web-utils` | 0.0.4 | `safeHref`, `safePath` | its audit | |
| `@meddleware/wallet-adapter` | 0.0.23 | wallet, network, gRPC client, executor | its audit | network selected from the instance (F10) |
| `@meddleware/chain-payments-kit` / `-client` | 0.0.2 / 0.0.1 | crypto checkout (lazy) | their audits | the client's built-in ids |
| `@mysten/sui`, `@mysten/wallet-standard` | 2.39.1, 0.21.38 | signing, fee read (lazy) | clean | one copy (`npm ls`) |
| Chain Payments public origin | build arg | the crypto checkout; fails **closed** (no quote, nothing signed) | — | CSP `connect-src` |
| Sui full node | wallet adapter's default for the network | fee read and execution; fails **closed** (the kit refuses to sign) | — | CSP origin is a build arg (F10) |
| `@meddleware/frontend-config` | 0.0.11 (dev) | lint, sweep, CSP check, dist scan, audit gate, sync | its audit | peers hold back #3/#4/#6 (F13) |
| `@playwright/test`, `axe-core`, `@axe-core/playwright` | 1.64.1, 4.14.1, 4.14.0 (dev) | the sweep | clean | |
| `@lhci/cli` | 0.16.1 (dev) | Lighthouse | `overrides`: `basic-ftp`, `tmp`, `zod` | D104 |
| `picomatch` | ≤ 4.0.7 (dev, transitive) | build and lint globs | GHSA-fc5q-39xc-vjpf, allowlisted to 2027-01-31 (frontend-config template) | FU-0136 |
| `minimatch` via `js-beautify` | 10.2.6 (dev, transitive) | component-test formatting | GHSA-g3hv-75wg-m249 (Dependabot) | F11, FU-0145 |
| static-server | 0.1.12 (digest) | serving, headers | its audit; Trivy in the release | |

TS shared-dependency matrix (this repo): `@mysten/sui` 2.39.1 (dep), `@mysten/wallet-standard` 0.21.38 (dep), `vue` ^3.5.43 → 3.5.45,
`typescript` ~6.0.0 → 6.0.3, `vitest` ~5.1.0 → 5.1.0; no `@mysten/walrus`, `seal` or `bcs` of its own. First-party `^0.0.x` ranges
are exact. No peers (an app).

### B.2 Publish authority, capabilities & secret custody

| Authority / secret | Where held | Custody | Gates | Rotation |
| --- | --- | --- | --- | --- |
| quay.io / Docker Hub push | `QUAY_TOKEN`, `DOCKERHUB_TOKEN` repo secrets (robot accounts) | GitHub | image releases (tag `v*`) | robot tokens, rotated by the maintainer |
| Image signature | keyless cosign (OIDC) | GitHub OIDC → Fulcio | the cluster's `ClusterImagePolicy` | n/a |
| Self-hosted mirror | `PRIVATE_REGISTRY_*` | GitHub | best-effort copy, verified by identity | maintainer |
| npm | none (not published) | — | — | — |

The app holds no runtime secret. Its build arguments are public values.

#### CI & release integrity

- Actions pinned — holds (F27).
- Least privilege — holds.
- OIDC trusted publishing — n/a for npm; image credentials inventoried above.
- Tag-gated, idempotent publish — holds (tags `v*`; re-tagging rebuilds the same digest set).
- Release gate equals CI — holds (`verify: uses: ./.github/workflows/node-ci.yml`).
- Automated dependency updates — holds (npm, docker, Actions; F13 for the held ones).
- Container images — IMG rows below.
- Secrets never echoed — holds.
- Real funds manual — n/a: no job signs on a chain.
- Test-only modes — holds (F26, F6).

### B.VUE-1 Hosting headers

| Header | Image (static-server) | `vite preview` (tests) |
| --- | --- | --- |
| `Content-Security-Policy` | Dockerfile `CSP` + nonce (F22) | the same string, without `upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (static-server) | n/a (http) |
| `Referrer-Policy`, `Permissions-Policy`, `nosniff` | set (`smoke.sh`) | Vite defaults |
| Framing | `frame-ancestors 'none'` + `X-Frame-Options: SAMEORIGIN` | the CSP |

### B.VUE-2 Build inputs and artifacts

There are no production sourcemaps (Vite's default). The Docker build arguments are listed in the front matter, and none is a
test-mode switch. `.dockerignore` keeps local env files out.

### B.IMG-1 Publish & attestation

The image is signed at the index digest. The SBOM is attached as an SPDX attestation, and build provenance is attested on both
registries. No signing step uses `continue-on-error`; only the mirror does, as a best-effort copy. The image is scanned (Trivy, fixable
CRITICAL/HIGH) before it is signed. Verification pins the workflow identity (the mirror job's `--certificate-identity-regexp`).

### B.A11Y-1 Gate inventory

| Gate | Tool | Scope | Fails CI? | Evidence |
| --- | --- | --- | --- | --- |
| axe AA + AAA | `defineA11ySuite` (frontend-config 0.0.11) | 26 states × 10 looks × 5 browsers | yes (`aaa: 'gate'`) | `node-ci.yml` "Browser tests" (`E2E_BROWSERS=all`) |
| reflow 320 px / 200 % / forced colours / reduced motion / keyboard | `defineA11ySuite` | the same 26 states | yes | same |
| axe with the preview frame present | `expectAccessible` (frame excluded) + `expectKeyboardFocusVisible` | editor | yes | `app.spec.ts` |
| Lighthouse accessibility | `@lhci/cli` | the built app | yes (100) | `node-ci.yml` "Lighthouse" |
| token contrast | design-tokens `check:contrast` | every theme × season | its CI | design-tokens audit |
| template / CSS / HTML lint; token-only colours | eslint + vuejs-accessibility, stylelint, html-validate; `design-tokens-used.test.ts` | `src/` | yes | `node-ci.yml` |

### B.SC-1 ID-constant trace

| Location | Network | Value | Kind | Matches latest |
| --- | --- | --- | --- | --- |
| `@meddleware/chain-payments-client` `SUI_PACKAGES.testnet` (consumed) | testnet | `0x610cf31f…6af2` | published-at = original-id (fresh package, UpgradeCap burned) | Y (FU-0131 resolution) |
| `e2e/open.ts` `TESTNET_PACKAGE` (fixture only) | testnet | same | — | Y (`tests/e2e-fixture.test.ts`) |

### B.SC-2 Coupling table

There is none of the app's own. It calls no Move function; the client's builder is covered by the client's audit.

### B.TS-2 Install-time code

There are no lifecycle scripts. `overrides`: `basic-ftp ^6.2.4`, `tmp ^0.2.7` and `zod ^4.6.7` (transitive Lighthouse tooling, D104);
F11 proposes a scoped `js-beautify` → `minimatch` override.

## Section C — Test-coverage & hermetic/live split

### C.1 Coverage grade — B+ (130 vitest, 406 Chromium browser tests)

| Dimension | Assessment |
| --- | --- |
| Happy path | sign-up (passkey with a virtual authenticator; wallet), sign-in (wallet), editor round trip and reorder, publish, billing with each checkout kind, the report form, the console's report and refund flows, the local editor |
| Error paths | refused saves with issues placed on fields; 401/403/503/502 at the console; no answer and the new deadline; non-https payment pages and wallet approvals; the kit's failure reasons; expired and cancelled checkouts; 404 ending a poll |
| Boundary | the phone width (375 px) and 320 px reflow; 200 % text; longest fake content; empty checkout fields → unsupported |
| Security-relevant | CSRF header and no token; relative URLs only; sandbox tokens; loopback-only requests (jsdom and browser); CSP violations fail every browser test; dist scan; the fee shown before signing |

Unit tests: `vitest` 130 (9 files). Browser: Playwright, Chromium locally (406), five projects in CI. Env-gated: `REQUIRE_DIST=1`
makes `tests/dist.test.ts` fail without a build (CI sets it); `E2E_BROWSERS=all` runs five browsers; `SHOTS=1` takes screenshots.

### C.2 Hermetic vs. live paths

| Path | Hermetic? | Live | Tracking |
| --- | --- | --- | --- |
| The service's API | yes (FakeService in jsdom and through `page.route`) | the hosted testnet deployment (S5 verification) | service audit |
| Passkey ceremony | yes (Chromium virtual authenticator) | real authenticators, by hand | F14 |
| Wallet signing and the fee read | yes (mock wallet, stub chain with a `PlatformConfig`) | testnet SUI and USDC payments (S5; FU-0131) | — |
| Provider pages and Open Payments wallets | yes (stand-in page) | provider sandboxes (S6, FU-0116) | — |
| The CSP's Sui origin against the real full node | no (the stub chain makes no request) | the deployed image only | F10 |

## Section D — Deployment-readiness gates

### pre-localnet

- [x] builds; lint, type-check and unit tests green — see Scope
- [x] no `v-html`; every dynamic `href`/`src` allowlisted; no secret `VITE_*` (F19, F5)
- [x] `VITE_*` inventory complete and matching `.env.example` (front matter)
- [x] every FROM digest-pinned; `.dockerignore`; lockfile installs; no secrets in layers (F27)

### pre-testnet

- [x] test-mode guards on mode and flag; production-artefact scan in CI and the image build (F26, F6)
- [x] signing UX shows the amount, the fee and its recipient, and the network; double submission blocked (F23)
- [x] axe AA/AAA sweep over every reachable state on the built artefact (F7)
- [x] CSP on every hosting path; `connect-src` limited to the three origins (F22)
- [x] deployment by digest from `config/images.yaml`; non-root and a restricted pod security context
- [ ] liveness probe on the UI pods (F12, FU-0146)
- [x] `SECURITY.md` present and consistent
- [x] CI gates green on GitHub — green on `02a4bac`; this pass's changes run on the next push

### pre-mainnet

- [ ] one network value binds the wallet, the CSP origin and the quote (F10, FU-0144)
- [ ] manual review recorded: screen reader on the main flows, 44 px targets, link purpose (F14, FU-0148)
- [ ] dependency advisories clear or allowlisted with expiry (F11, FU-0145)
- [ ] external review

## Cross-project themes

- **Supply chain & release integrity.** Lockfile, `npm ci`, the synced audit allowlist, pinned Actions, signed and attested images,
  Dependabot; F11 and F13 are open.
- **Wire-format coupling.** The service's JSON (`src/api/types.ts`) has no shared vector in this repo. The service's OpenAPI snapshot
  and this repo's FakeService (which answers "with the shapes crates/api/src/hosted/app.rs" writes) are the two sides. Drift shows up
  in the hosted S5 verification, not in a test here. SHOULD: generate `types.ts` from the snapshot (suggestions).
- **On-chain-truth boundary.** Holds. "Paid" comes from the service after the chain; the fee is read from the chain; the amounts and
  months shown are the service's.
- **Deployment readiness.** Section D.
- **Chain-access layering.** Holds (F23). The only ids come from the client's `deployments`-style export.
- **Versioning.** Pre-0.2; the next tag is 0.0.3.

## Normative requirements (MUST / MUST NOT)

- VUE-M1 holds (F19, F5, F2).
- VUE-M2 holds (no secret `VITE_*`; ids from the client).
- VUE-M3 holds (F26, F6).
- VUE-M4 holds for the action, amount, fee recipient and network (F23). The network-mismatch block is F10: it fails closed, without
  saying why.
- VUE-M5 n/a: the irreversible actions are account deletion (typed handle confirmation in `AccountView`) and the payment the buyer
  chose.
- VUE-M6 holds through the wallet adapter (change events; the executor refuses after a network switch).
- VUE-M7 holds: the app stores nothing; the kit's pending payment is in `sessionStorage`, keyed by session and re-checked by the
  service.
- VUE-M8 holds (F22; HSTS from static-server).
- VUE-M9 holds (scoped styles; `LinkInBioView` renders no shell chrome).
- A11Y-M1 holds (F7; the CI five-browser run follows the next push).
- A11Y-M2, A11Y-M3, A11Y-M5 and A11Y-M6 hold.
- A11Y-M4 holds in the keyboard pass. The preview frame draws its own focus ring (`PreviewFrame.vue`).
- A11Y-M7 holds (Known exceptions).
- TS-M1 holds (strict `vue-tsc`).
- TS-M2 is adjudicated (F16).
- TS-M3 holds (money is pence integers, formatted only; coin amounts are the kit's bigint).
- TS-M4 holds: the empty `catch` blocks are commented and are not on security paths (logout, the instance read on the report form,
  loopback detection).
- TS-M5 holds (F1).
- TS-M6 holds.
- TS-M7 is n/a (not published).
- TS-M8 holds; F11 is open.
- TS-M9 holds for this repo; #3 must not be merged until the peer is widened (F13).
- IMG-M1 to IMG-M4 and IMG-M6 to IMG-M8 hold.
- IMG-M5 holds, apart from the missing liveness probe (F12).
- SC-M1, SC-M2, SC-M3, SC-M4, SC-M7 and SC-M9: the client's.
- SC-M5 is F10.
- SC-M6 and SC-M8 are n/a.
- SC-M10 holds.

## Implementation suggestions (SHOULD / MAY)

- SHOULD generate `src/api/types.ts` from the service's OpenAPI snapshot, or check it against the snapshot in CI, so the two sides of
  the wire format cannot drift silently.
- SHOULD show the instance's network next to the wallet control while signed in, so a person can see it before paying.
- MAY validate the hosted answers that steer the UI's state machine (`Billing.offers`, `CheckoutStatus.status`) by shape, as
  `planCheckout` does for the checkout's `client`.
- MAY render the EPC payload as a QR code locally. The text is shown today. A local renderer needs no new CSP origin.

## Open questions (`OQ#`)

- **OQ1** — For F10: should the deployment set the CSP at run time (static-server's `CONTENT_SECURITY_POLICY` from the same
  configuration as `SUI_NETWORK`)? Or should the image stay built per network, with the S7 checklist rebuilding it on the switch to
  mainnet?

## Risks (residual)

- The service is the authority for every decision. A compromised service can show anything, but it cannot sign for the wallet, and
  redirects stay https.
- The preview route's own headers (it must allow framing by the app origin and nothing else) are the service's.
- Wallet extensions decide what a person sees when signing.
- Shared libraries (`@meddleware/ui`, wallet-adapter, the kit, frontend-config) carry focus, busy and signing behaviour; their audits
  hold them.

## Re-verification log

- 2026-11-18 — First pass at `02a4bac` plus this pass's changes:
  - read every source, test, e2e, workflow and image file; the deployment manifest; the open Dependabot PRs;
  - lint, `vue-tsc`, build, `check:dist` and `check:csp` clean; 130/130 vitest; 406/406 Playwright on Chromium with the CI font;
    audit gate passes with one allowlisted advisory;
  - fixed F1 to F9, adding 17 sweep states and the real-browser loopback test;
  - deferred F10 to F14 to FU-0144 to FU-0148;
  - adjudicated F15 to F18;
  - opened OQ1.

## Pre-save consistency checklist (this pass)

- [x] Section A ↔ findings (I10 → F10; I15 → F12; the rest HOLDS with tests)
- [x] Finding header ↔ body
- [x] Template line (`check-template-dates.mjs`)
- [x] Closing structure in order
- [x] Open questions stay open
- [x] Section D ↔ dispositions
- [x] Executive summary matches the current dispositions
- [x] Counts re-measured (130 vitest, 406 Playwright)
- [x] Re-verification log entry
