# ── build stage ───────────────────────────────────────────────────────────────
# Standalone build — the Docker context is this repo root. Every @meddleware/* dependency, the Chain Payments kit and client
# included, resolves from npm at the version the lockfile names.
#
# Build args (none has a default: a deployment that gives none gets no link and no extra origin):
#   VITE_TERMS_URL         — the terms of service (sign-up and the footer)
#   VITE_PRIVACY_URL       — the privacy notice (the footer)
#   CHAIN_PAYMENTS_ORIGIN  — the Chain Payments public origin the checkout widget calls (https://…, no path)
#   SUI_RPC_ORIGIN         — the Sui full node origin the image's policy allows by default (https://…, no path)
# The account API is same-origin (/api/v1), so connect-src is 'self' plus exactly those two origins. Everything else about the
# deployment (product name, hosts, price, sign-up mode, Sui network) comes from GET /api/v1/instance at run time.
#
# The full node is configurable at every level, and the levels agree by construction:
#   build      SUI_RPC_ORIGIN (above) puts an origin in the image's default policy;
#   container  CSP_CONNECT_SRC_EXTRA (static-server 0.1.13) adds origins to connect-src at start-up, each checked to be a bare
#              https origin (an invalid value stops the server, so nothing can widen the policy further);
#   service    SUI_RPC_URL (link-in-bio-service 0.0.7; the public full node by default) is what the app's wallet uses: the
#              instance reports it as suiRpcUrl and the app applies it (wallet-adapter setRpcUrl);
#   deployment the overlay gives SUI_RPC_URL to the service and the same value to this container as CSP_CONNECT_SRC_EXTRA.
ARG CHAIN_PAYMENTS_ORIGIN=""
ARG SUI_RPC_ORIGIN=""
ARG CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ${CHAIN_PAYMENTS_ORIGIN} ${SUI_RPC_ORIGIN}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"

# The build stage runs on the BUILD host's architecture: its output (static files) is architecture-independent,
# so no arm64 step runs under emulation. The final stage only COPYs into the multi-arch static-server image.
FROM --platform=$BUILDPLATFORM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4 AS build

WORKDIR /app

# An origin build arg is a bare https origin or nothing: no path, no space and no ';' that could add a directive to the policy.
ARG CHAIN_PAYMENTS_ORIGIN
ARG SUI_RPC_ORIGIN
RUN for o in "${CHAIN_PAYMENTS_ORIGIN}" "${SUI_RPC_ORIGIN}"; do \
      [ -z "$o" ] || printf '%s' "$o" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' || { echo "not an https origin: $o" >&2; exit 1; }; \
    done

COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_TERMS_URL
ARG VITE_PRIVACY_URL

ENV VITE_TERMS_URL=${VITE_TERMS_URL} \
    VITE_PRIVACY_URL=${VITE_PRIVACY_URL}

# The production bundle carries no test support (the fake service, the e2e build's mock wallet and stub chain, test hooks): the
# same scan CI runs, so a tag can never ship an image CI would have refused.
RUN npm run build && npm run licenses && npm run check:dist
ARG CSP
# The CSP has no 'unsafe-inline' for scripts: the build fails if dist/ ever carries an inline <script>.
RUN npx mw-check-csp-inline "${CSP}" dist

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM quay.io/meddleware-org/static-server:0.1.14@sha256:27f3d7a61f19a95b3abfc991d813a178bc1995a15e60f16a35a8a5a6dda4ce8e
ARG CSP
ENV CONTENT_SECURITY_POLICY="${CSP}"

COPY --from=build /app/dist /app/public
# The lockfile lets SBOM scanners see the npm packages the bundle was built from (the bundle itself carries no
# package metadata). It sits outside the served directory; THIRD_PARTY_LICENSES is served with the site.
COPY --from=build /app/package-lock.json /usr/share/doc/link-in-bio-ui/package-lock.json

ENV SERVE_DIR=/app/public \
    SPA_FALLBACK=true \
    CACHE_IMMUTABLE_PREFIX=/assets/

# The base image already runs as nobody; say so here too so the Dockerfile is self-describing.
USER 65534:65534

EXPOSE 8080
