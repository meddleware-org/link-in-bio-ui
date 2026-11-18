// The service's JSON shapes (camelCase), as crates/api/src/hosted/app.rs and admin.rs write them. Times are RFC 3339 strings.

import type { Issue } from './errors.js'

export type SignupMode = 'closed' | 'invite' | 'open'

/** `GET /api/v1/instance`: what this deployment offers. Every operator value the app shows comes from here. */
export interface Instance {
  product: string
  version: string
  appHost: string
  pagesDomain: string
  signup: SignupMode
  thirdPartyPages: boolean
  termsVersion: string
  minimumAge: number
  pricePence: number
  currency: string
  billingProviders: string[]
  customDomains: boolean
  federation: boolean
  authenticators: string[]
  suiNetwork: string
}

/** `GET /api/v1/limits`: every bound the page parser enforces. */
export interface Limits {
  manifestBytes: number
  displayName: number
  handle: number
  bio: number
  pronouns: number
  linkTitle: number
  groupTitle: number
  linkDescription: number
  links: number
  groups: number
  id: number
  contacts: number
  support: number
  label: number
  urlBytes: number
  reservedHandles: string[]
  icons: string[]
}

export interface Account {
  id: string
  handle: string
  status: 'active' | 'suspended' | 'deleted'
  free: boolean
  paidUntil: string | null
  entitled: boolean
  country: string | null
  createdAt: string
  pageUrl: string
  termsVersion: string
  suspension: { kind: string | null; until: string | null } | null
}

/** `GET /api/v1/me`. */
export interface Me extends Account {
  passkeys: Array<{ id: string; name: string }>
  wallets: string[]
  recoveryCodesLeft: number
}

/** WebAuthn options as webauthn-rs writes them (`{ publicKey: { … } }`, binary fields in base64url). */
export type WebAuthnOptionsJson = Record<string, unknown>

export interface CeremonyStart {
  challenge: string
  options: WebAuthnOptionsJson
}

export interface WalletChallenge {
  challenge: string
  message: string
}

export interface SignupStartBody {
  handle: string
  ageConfirmed: boolean
  termsAccepted: boolean
  termsVersion: string
  country?: string
  invite?: string
  method: 'passkey' | 'sui-wallet'
  address?: string
}

export interface SignupFinished {
  account: Account
  recoveryCodes: string[]
}

export interface SignedIn {
  account: Account
  recoveryCodesLeft?: number
}

export type Verdict = 'unchecked' | 'clean' | 'flagged' | 'unknown'

export interface Screening {
  url: string
  verdict: Verdict
  detail: string | null
}

/** `GET /api/v1/page`. `issues` are the parser's warnings, or its errors when the stored draft no longer passes. */
export interface PageState {
  draft: unknown
  published: boolean
  version: number
  updatedAt: string | null
  publishedAt: string | null
  url: string
  issues: Issue[]
  screening: Screening[]
  changed: boolean
}

export interface Published {
  version: number
  url: string
  hidden: Screening[]
  online: boolean
}

export interface Offer {
  id: string
  provider: string
  label: string
  seller: 'operator' | 'merchant-of-record'
  fees: { fixedPence: number; percentBps: number }
  recurring: boolean
  minMonths: number
  maxMonths: number
}

export interface RefundRequestState {
  id: string
  status: 'open' | 'refunded'
  refundReference: string | null
  at: string
  decidedAt: string | null
}

export interface BillingEvent {
  id: string
  provider: string
  kind: 'purchase' | 'grant' | 'refund'
  months: number
  amountPence: number
  at: string
  paidUntil: string | null
  /** A payment that arrived after its checkout was paid or closed (credited as months). */
  unapplied?: boolean
  /** Until when a refund may be asked for, when it may. */
  refundableUntil?: string | null
  refundRequest?: RefundRequestState | null
}

/** Open Payments: what the buyer's wallet will be asked to approve. */
export interface OpenPaymentsAmount {
  value: string
  assetCode: string
  assetScale: number
}

export interface OpenPaymentsRedirect {
  kind: 'open-payments'
  step: 'redirect'
  redirect: string
  wallet: string
  debitAmount: OpenPaymentsAmount
  receiveAmount: OpenPaymentsAmount
}

export interface OpenPaymentsFinished {
  checkout: string
  status: CheckoutStatusName
  outgoingPayment?: string
}

/** `GET /api/v1/billing`. */
export interface Billing {
  free: boolean
  paidUntil: string | null
  entitled: boolean
  pricePence: number
  currency: string
  offers: Offer[]
  notes: string[]
  events: BillingEvent[]
}

/** What the provider's checkout needs in the browser. Chain Payments: a session id and its public origin. */
export type CheckoutClient =
  | { kind: 'chain-payments'; sessionId: string; baseUrl: string }
  | { kind: string; [k: string]: unknown }

export interface CheckoutStarted {
  checkout: string
  amountPence: number
  client: CheckoutClient
}

export type CheckoutStatusName = 'open' | 'paid' | 'expired' | 'cancelled'

export interface CheckoutStatus {
  checkout: string
  status: CheckoutStatusName
  months: number
  paidUntil: string | null
}

export interface TxtRecord {
  name: string
  type: 'TXT'
  value: string
}

export interface Domain {
  hostname: string
  status: 'pending' | 'verified' | 'failed'
  verifiedAt: string | null
  record: TxtRecord
}

export interface Domains {
  enabled: boolean
  domains: Domain[]
}

export interface HeldInvites {
  codes: Array<{ code: string; expiresAt: string }>
  redeemed: number
}

export interface Statement {
  report: string
  reason: string
  decision: string | null
  statement: string | null
  decidedAt: string | null
}

export interface AppealRecord {
  appeal: string
  report: string | null
  status: 'open' | 'upheld' | 'rejected'
  statement: string | null
  at: string
}

export interface Statements {
  statements: Statement[]
  appeals: AppealRecord[]
}

export interface ReportBody {
  page: string
  url?: string
  reason: string
  details: string
  contact?: string
}

// ── the console (/api/v1/admin) ─────────────────────────────────────────────────────────────────────────────────────

export interface Operator {
  subject: string
  name: string
}

export interface Overview {
  accounts: { active: number; suspended: number; free: number; paid: number }
  pagesPublished: number
  reports: { open: number; openOver24h: number }
  appealsOpen: number
  links: { flagged: number; unknown: number }
  storageBytes: number
  checkoutsOpen: number
  switches: {
    signup: SignupMode
    thirdPartyPages: boolean
    billingProviders: string[]
    customHostnameCap: number
    webRisk: boolean
    federation: boolean
    bankFeeds?: string[]
  }
  bankFeeds?: { feed: string; polledAt: string | null; lastError: string | null; creditsSeen: number }[]
}

/** A refund request in the console's queue: what the refund must match, and how it was settled. */
export interface RefundRequestRow {
  id: string
  account: string
  handle: string
  event: string
  provider: string
  months: number
  amountPence: number
  paidAt: string
  reason: string | null
  status: 'open' | 'refunded'
  createdAt: string
  refundReference: string | null
  refundEvent: string | null
  decidedBy: string | null
  decidedAt: string | null
  payment: { digest: string | null; payer: string | null; coinType: string | null; amount: string | null; method: string | null; checkout: string | null } | null
}

export interface AccountRow {
  id: string
  handle: string
  status: 'active' | 'suspended' | 'deleted'
  suspensionKind: 'policy' | 'legal' | null
  suspensionReason: string | null
  suspendedUntil: string | null
  free: boolean
  operator: boolean
  mayShareInvites: boolean
  invitedBy: string | null
  tags: string[]
  country: string | null
  paidUntil: string | null
  createdAt: string
}

export interface AccountDetail {
  account: AccountRow
  page: { published: boolean; version: number; publishedAt: string | null; document: unknown } | null
  invitees: AccountRow[]
  invites: Array<{ id: string; createdAt: string; expiresAt: string; redeemedBy: string | null; revokedAt: string | null }>
  billing: Array<{ provider: string; kind: string; months: number; amountPence: number; at: string }>
  domains: Array<{ hostname: string; status: string }>
  audit: Array<{ at: string; actor: string; action: string; details: unknown }>
}

export interface InviteRow {
  id: string
  heldBy: string | null
  selection: string | null
  note: string | null
  createdBy: string
  createdAt: string
  expiresAt: string
  redeemedBy: string | null
  redeemedAt: string | null
  revokedAt: string | null
}

export interface Issued {
  codes: string[]
  issued: number
  expiresAt: string
}

export interface Criteria {
  minAgeDays?: number | null
  published?: boolean | null
  paid?: boolean | null
  inviteesInGoodStanding?: boolean | null
  tag?: string | null
}

export interface Selection {
  id: string
  name: string
  criteria: Criteria
  createdBy: string
  createdAt: string
}

export interface ReportRow {
  id: string
  page: string
  account: string | null
  url: string | null
  reason: string
  details: string
  contact: string | null
  status: 'open' | 'actioned' | 'dismissed'
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  decision: string | null
  statement: string | null
}

export interface AppealRow {
  id: string
  account: string
  report: string | null
  text: string
  status: 'open' | 'upheld' | 'rejected'
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  statement: string | null
}

export interface BlockEntry {
  pattern: string
  kind: 'host' | 'url'
  reason: string
  addedBy: string
  addedAt: string
}

export interface AuditEntry {
  id: number | string
  at: string
  actor: string
  action: string
  subject: string
  details: unknown
}
