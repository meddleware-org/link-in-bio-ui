// The account API on the app host, one typed function per route (crates/api/src/hosted/routes.rs, APP_ROUTES).

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
  WalletChallenge,
} from './types.js'
import type { Issue } from './errors.js'

const enc = encodeURIComponent

export function appApi(http: Http) {
  return {
    instance: () => http.get<Instance>('/api/v1/instance'),
    limits: () => http.get<Limits>('/api/v1/limits'),

    signupStart: (b: SignupStartBody) => http.post<CeremonyStart | WalletChallenge>('/api/v1/signup/start', b),
    signupFinish: (b: { challenge: string; credential?: unknown; signature?: string; passkeyName?: string }) =>
      http.post<SignupFinished>('/api/v1/signup/finish', b),
    passkeyLoginStart: (handle?: string) => http.post<CeremonyStart>('/api/v1/login/passkey/start', handle ? { handle } : {}),
    passkeyLoginFinish: (b: { challenge: string; credential: unknown }) => http.post<SignedIn>('/api/v1/login/passkey/finish', b),
    walletLoginStart: (address: string) => http.post<WalletChallenge>('/api/v1/login/wallet/start', { address }),
    walletLoginFinish: (b: { challenge: string; signature: string }) => http.post<SignedIn>('/api/v1/login/wallet/finish', b),
    recoveryLogin: (b: { handle: string; code: string }) => http.post<SignedIn>('/api/v1/login/recovery', b),
    logout: () => http.post<void>('/api/v1/logout'),

    me: () => http.get<Me>('/api/v1/me'),
    deleteMe: (confirm: string) => http.del<void>('/api/v1/me', { confirm }),
    /** A plain link: the browser downloads it with the session cookie (the answer is `Content-Disposition: attachment`). */
    exportPath: '/api/v1/me/export',
    setCountry: (country: string | null) => http.put<void>('/api/v1/me/country', { country }),
    passkeyAddStart: () => http.post<CeremonyStart>('/api/v1/me/passkeys/start'),
    passkeyAddFinish: (b: { challenge: string; credential: unknown; name?: string }) => http.post<void>('/api/v1/me/passkeys/finish', b),
    passkeyRemove: (id: string) => http.del<void>(`/api/v1/me/passkeys/${enc(id)}`),
    walletLinkStart: (address: string) => http.post<WalletChallenge>('/api/v1/me/wallets/start', { address }),
    walletLinkFinish: (b: { challenge: string; signature: string }) => http.post<void>('/api/v1/me/wallets/finish', b),
    walletUnlink: (address: string) => http.del<void>(`/api/v1/me/wallets/${enc(address)}`),
    replaceRecoveryCodes: () => http.post<{ recoveryCodes: string[] }>('/api/v1/me/recovery-codes'),
    statements: () => http.get<Statements>('/api/v1/me/statements'),
    invites: () => http.get<HeldInvites>('/api/v1/me/invites'),

    page: () => http.get<PageState>('/api/v1/page'),
    savePage: (doc: unknown) => http.put<{ saved: boolean; warnings: Issue[] }>('/api/v1/page', doc),
    previewPath: '/api/v1/page/preview',
    publish: () => http.post<Published>('/api/v1/page/publish'),
    unpublish: () => http.post<void>('/api/v1/page/unpublish'),
    versions: () => http.get<{ versions: Array<{ version: number; at: string }> }>('/api/v1/page/versions'),
    restore: (version: number) => http.post<void>(`/api/v1/page/versions/${enc(String(version))}/restore`),
    uploadAvatar: (file: Blob) =>
      http.request<{ avatar: string; url: string }>('POST', '/api/v1/page/avatar', { body: file, contentType: file.type || 'application/octet-stream' }),

    billing: () => http.get<Billing>('/api/v1/billing'),
    createCheckout: (method: string, months: number) => http.post<CheckoutStarted>('/api/v1/billing/checkouts', { method, months }),
    checkout: (id: string) => http.get<CheckoutStatus>(`/api/v1/billing/checkouts/${enc(id)}`),

    domains: () => http.get<Domains>('/api/v1/domains'),
    addDomain: (hostname: string) => http.post<{ hostname: string; record: TxtRecord }>('/api/v1/domains', { hostname }),
    removeDomain: (hostname: Domain['hostname']) => http.del<void>(`/api/v1/domains/${enc(hostname)}`),

    report: (b: ReportBody) => http.post<{ report: string }>('/api/v1/reports', b),
    appeal: (b: { report?: string; text: string }) => http.post<{ appeal: string }>('/api/v1/appeals', b),
  }
}

export type AppApi = ReturnType<typeof appApi>
