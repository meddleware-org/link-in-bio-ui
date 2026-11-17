# Security Policy

## Scope

The `@meddleware/link-in-bio-ui` source and image. Out of scope: the Link in Bio service (its own policy), the access gate in front of
the admin host, Chain Payments, wallets and the cluster.

## Security model

1. The app holds no credential. The service's session cookie is `__Host-`, HttpOnly and SameSite=Strict; the app sends it with
   `credentials: 'same-origin'` and never reads it. The console's session is the access gate's, never this code's.
2. Every state-changing request carries `X-Link-In-Bio-Request` (the service also checks `Origin`); the loopback editor's writes also
   carry `X-Link-In-Bio-Editor`.
3. The CSP allows `connect-src 'self'` plus, as build arguments, the Chain Payments public origin and the Sui full node origin; no
   inline script; `frame-ancestors 'none'`. The image build refuses an origin argument that is not a bare `https://` origin.
4. The page preview is the service's renderer's output in a frame with `sandbox=""` (no scripts, opaque origin). Nothing a person typed
   is ever rendered as markup in the app: there is no `v-html`.
5. The local editor talks only to its own loopback origin (a test proves it).
6. Every decision (validity of a page, limits, screening, prices, who may do what) is the service's; the app shows what it says.
7. The image is static-server, nonroot, read-only.

## Supported versions

The latest release. Pre-0.2 versions receive fixes only in the next release.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting on this repository ("Report a vulnerability" under
the Security tab) with a description, reproduction steps, and the version or commit. Acknowledgement within **3 business days**; a plan
within **14 days** for confirmed issues.
