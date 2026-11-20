# Open standards and interoperability: link-in-bio-ui

The Link in Bio app (sign-in, page editor, billing) and the operator console.

Served at `app.meddleware.link`.

This page lists what the project speaks today, what is planned, what was considered and does not apply, where someone else can extend it, and what proves each claim. The platform-wide list is [Standards we use](https://meddleware.dev/platform/standards). A row appears there in the same change that turns a standard on.

## Spoken today

- Content Security Policy (W3C), sent as a header
- HTTP Strict Transport Security (RFC 6797)
- Web App Manifest (W3C)
- Robots Exclusion Protocol (RFC 9309) at /robots.txt
- llms.txt (a community convention, not a formal standard)
- WCAG 2.2 level AA with AAA contrast (W3C), tested on every change
- No cookie and no browser storage before an action, tested on every change
- RFC 3339 timestamps
- Wallet Standard (connects any compatible wallet, through @meddleware/wallet-adapter)
- Web Authentication passkeys (W3C), in the service

## Planned

- Show and verify rel="me" links and export a page's links as a linkset (RFC 9264)
- Open Payments checkout (GNAP with RFC 9421 signatures)
- Platform-wide sign-in through the OpenID Connect provider

## Considered, not applicable

- Sitemap and Open Graph on the app host: the app is behind sign-in; the public pages are rendered by link-in-bio-service, which already speaks Web Linking, linksets, h-card, WebFinger, ActivityPub, AT Protocol and NIP-05 handles

## Extension points

- Tenant pages and the profile formats belong to link-in-bio-service (its own design record); the checkout is @meddleware/chain-payments-kit

## What proves it

- e2e/a11y.spec.ts
- the service's render and webfinger tests

_Maintained centrally with the platform's interoperability map; changes go through it so every repository says the same thing._
