// The account API on the app host, one typed function per route (crates/api/src/hosted/routes.rs, APP_ROUTES).

// The HTTP layer every call goes through.
import type { Http } from './http.js'
import type {
  Billing,
  CeremonyStart,
  CheckoutStarted,
  CheckoutStatus,
  Domain,
  Domains,
  HeldInvites,
  Instance,
  Limits,
  Me,
  PageState,
  Published,
  ReportBody,
  SignedIn,
  SignupFinished,
  SignupStartBody,
  Statements,
  TxtRecord,
  WalletChallenge, OpenPaymentsFinished, OpenPaymentsRedirect, Refundable, RefundAsk, RefundOffer } from './types.js'
// A finding about a page document.
import type { Issue } from './errors.js'

// Path segments are always encoded, so an id or a handle can never change the route.
const enc = encodeURIComponent

/** The account API on the app host: one typed function per route. Nothing here holds state. */
export function appApi(http: Http) {
  return {
    // Public: what this deployment offers, and the bounds the page parser enforces.
    instance: () => http.get<Instance>('/api/v1/instance'),
    limits: () => http.get<Limits>('/api/v1/limits'),

    // Sign-up: start a ceremony (a passkey or a wallet signature), then finish it; the answer carries the one-time recovery codes.
    signupStart: (b: SignupStartBody) => http.post<CeremonyStart | WalletChallenge>('/api/v1/signup/start', b),
    signupFinish: (b: { challenge: string; credential?: unknown; signature?: string; passkeyName?: string }) =>
      http.post<SignupFinished>('/api/v1/signup/finish', b),
    // Sign-in by passkey, by wallet, or with a recovery code, then sign out.
    passkeyLoginStart: (handle?: string) => http.post<CeremonyStart>('/api/v1/login/passkey/start', handle ? { handle } : {}),
    passkeyLoginFinish: (b: { challenge: string; credential: unknown }) => http.post<SignedIn>('/api/v1/login/passkey/finish', b),
    walletLoginStart: (address: string) => http.post<WalletChallenge>('/api/v1/login/wallet/start', { address }),
    walletLoginFinish: (b: { challenge: string; signature: string }) => http.post<SignedIn>('/api/v1/login/wallet/finish', b),
    recoveryLogin: (b: { handle: string; code: string }) => http.post<SignedIn>('/api/v1/login/recovery', b),
    logout: () => http.post<void>('/api/v1/logout'),

    // The account: read it, delete it, export it (a plain link so the browser downloads it with the session cookie).
    me: () => http.get<Me>('/api/v1/me'),
    deleteMe: (confirm: string) => http.del<void>('/api/v1/me', { confirm }),
    /** A plain link: the browser downloads it with the session cookie (the answer is `Content-Disposition: attachment`). */
    exportPath: '/api/v1/me/export',
    // The account's country, which can affect what may be sold.
    setCountry: (country: string | null) => http.put<void>('/api/v1/me/country', { country }),
    // Manage sign-in methods: add or remove a passkey, link or unlink a wallet, replace the recovery codes.
    passkeyAddStart: () => http.post<CeremonyStart>('/api/v1/me/passkeys/start'),
    passkeyAddFinish: (b: { challenge: string; credential: unknown; name?: string }) => http.post<void>('/api/v1/me/passkeys/finish', b),
    passkeyRemove: (id: string) => http.del<void>(`/api/v1/me/passkeys/${enc(id)}`),
    walletLinkStart: (address: string) => http.post<WalletChallenge>('/api/v1/me/wallets/start', { address }),
    walletLinkFinish: (b: { challenge: string; signature: string }) => http.post<void>('/api/v1/me/wallets/finish', b),
    walletUnlink: (address: string) => http.del<void>(`/api/v1/me/wallets/${enc(address)}`),
    replaceRecoveryCodes: () => http.post<{ recoveryCodes: string[] }>('/api/v1/me/recovery-codes'),
    // What the service has told this account: statements of reasons and appeals, and the invites it holds.
    statements: () => http.get<Statements>('/api/v1/me/statements'),
    invites: () => http.get<HeldInvites>('/api/v1/me/invites'),

    // The page: read the draft, save it, preview it, publish, unpublish, list and restore versions, upload the picture.
    page: () => http.get<PageState>('/api/v1/page'),
    savePage: (doc: unknown) => http.put<{ saved: boolean; warnings: Issue[] }>('/api/v1/page', doc),
    previewPath: '/api/v1/page/preview',
    publish: () => http.post<Published>('/api/v1/page/publish'),
    unpublish: () => http.post<void>('/api/v1/page/unpublish'),
    versions: () => http.get<{ versions: Array<{ version: number; at: string }> }>('/api/v1/page/versions'),
    restore: (version: number) => http.post<void>(`/api/v1/page/versions/${enc(String(version))}/restore`),
    uploadAvatar: (file: Blob) =>
      http.request<{ avatar: string; url: string }>('POST', '/api/v1/page/avatar', { body: file, contentType: file.type || 'application/octet-stream' }),

    // Billing: the offers and history, start a checkout, poll its status.
    billing: () => http.get<Billing>('/api/v1/billing'),
    createCheckout: (method: string, months: number) => http.post<CheckoutStarted>('/api/v1/billing/checkouts', { method, months }),
    checkout: (id: string) => http.get<CheckoutStatus>(`/api/v1/billing/checkouts/${enc(id)}`),
    /** Open Payments: the buyer's wallet address (a URL or a `$` payment pointer); answers where to approve the payment. */
    // Open Payments checkout steps (see the comments on each).
    openPaymentsWallet: (id: string, walletAddress: string) =>
      http.post<OpenPaymentsRedirect>(`/api/v1/billing/checkouts/${enc(id)}/open-payments`, { walletAddress }),
    /** Open Payments: back from the wallet, with the values it added to the return address. */
    openPaymentsFinish: (id: string, hash: string, interactRef: string) =>
      http.post<OpenPaymentsFinished>(`/api/v1/billing/checkouts/${enc(id)}/open-payments/finish`, { hash, interactRef }),
    /** What may be asked back now: cancellations, unstarted months, late payments, and the open request. */
    // Refunds: what may be asked back, ask, withdraw.
    refunds: () => http.get<Refundable>('/api/v1/billing/refunds'),
    /** Ask for a refund; the operator sends it by hand, and its months are taken back then. One open request at a time. */
    askRefund: (b: RefundAsk) => http.post<{ refundRequest: string; status: string; offer: RefundOffer }>('/api/v1/billing/refund-requests', b),
    withdrawRefund: (id: string) => http.post<void>(`/api/v1/billing/refund-requests/${enc(id)}/withdraw`),

    // Custom domains: list, add (answers with the TXT record to publish), remove.
    domains: () => http.get<Domains>('/api/v1/domains'),
    addDomain: (hostname: string) => http.post<{ hostname: string; record: TxtRecord }>('/api/v1/domains', { hostname }),
    removeDomain: (hostname: Domain['hostname']) => http.del<void>(`/api/v1/domains/${enc(hostname)}`),

    // Reports and appeals, which need no account for the report.
    report: (b: ReportBody) => http.post<{ report: string }>('/api/v1/reports', b),
    appeal: (b: { report?: string; text: string }) => http.post<{ appeal: string }>('/api/v1/appeals', b),
  }
}

/** The shape of the account API, for the context and the tests. */
export type AppApi = ReturnType<typeof appApi>
