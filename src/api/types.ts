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
  status: RefundStatus
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
  /** Every refund request of the account, newest first. */
  refundRequests?: AccountRefundRequest[]
}

export type RefundKind = 'cancel' | 'unstarted' | 'unapplied'
export type RefundStatus = 'open' | 'refunded' | 'withdrawn' | 'declined'

/**
 * One purchase's part of a refund: exactly what is sent back (`amount` of `unit`; `amountMinor` in its smallest denomination, `scale`
 * decimals) and the months it takes back. The deductions are in the same unit: the payment provider's fee share, an outgoing charge
 * and, for a cancellation, the days already used.
 */
export interface RefundOfferLine {
  purchase: string
  provider: string
  months: number
  amountMinor: number
  amount: string
  unit: string
  scale: number | null
  feeMinor: number
  chargeMinor: number
  usedMinor: number
  daysUsed: number
  /** For the operator: how to send it, and the provider's identifiers. */
  destination: { how?: string; [k: string]: unknown }
}

/** A recorded line: the offer line, plus how it was settled. */
export interface RefundLine extends RefundOfferLine {
  checkout: string | null
  amountPence: number
  status: 'open' | 'refunded'
  refundReference: string | null
  refundEvent: string | null
  refundedAt: string | null
  purchaseMonthsLeft: number
}

export interface RefundOffer {
  kind: RefundKind
  /** Months taken back once every line is refunded. */
  months: number
  /** Unstarted months: the paid period ends here afterwards. */
  until: string | null
  lines: RefundOfferLine[]
}

/** Either what may be asked for, or why not (in plain words). */
export type RefundAnswer = { offer: RefundOffer; refused?: undefined } | { refused: string; offer?: undefined }

/** A refund request as its account holder sees it. */
export interface AccountRefundRequest {
  id: string
  kind: RefundKind
  status: RefundStatus
  reason: string | null
  at: string
  decidedAt: string | null
  refundReference: string | null
  /** What was worked out when it was asked; `note` is the operator's reason when declined. */
  details: { computedAt?: string; until?: string | null; months?: number; note?: string; [k: string]: unknown } | null
  lines: RefundLine[]
}

/** `GET /api/v1/billing/refunds`: what may be asked back now, worked out exactly. */
export interface Refundable {
  openRequest: AccountRefundRequest | null
  /** Each purchase still inside the cancellation window. */
  cancel: Array<RefundAnswer & { purchase: string; at: string }>
  /** Months that have not begun (newest purchases first). `all` is the offer for every one of them. */
  unstarted: { months: number; all: RefundAnswer }
  /** Late payments, which may come back whole. */
  unapplied: Array<RefundAnswer & { purchase: string }>
  rules: { cancelDays: number; unappliedDays: number; daysPerMonth: number }
}

export interface RefundAsk {
  kind: RefundKind
  purchase?: string
  /** Unstarted: how many (all of them when absent). */
  months?: number
  reason?: string
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
  /** The change budgets in effect: changes (publishes and picture uploads) an hour, new links a day; 0 is no limit. */
  accountLimits?: { preset: 'standard' | 'generous'; changesPerHour: number; newLinksPerDay: number }
  webRisk?: OverviewWebRisk
}

/** Link screening with Google Web Risk this month (`lookup` checks each link; `update` keeps the lists here). */
export interface OverviewWebRisk {
  on: boolean
  mode: 'lookup' | 'update'
  month: string
  calls: number
  monthlyCap: number
  /** Lookup: calls past the free allowance that may be paid for. */
  paidMonthlyCalls?: number
  allowance?: number
  /** Lookup: the count at which rechecks stop, keeping the rest for new links. */
  rechecksStopAt?: number | null
  /** Update: confirmations of a local match this month, and their cap. */
  confirms?: number
  confirmMonthlyCap?: number
  maxEntries?: number
  lists?: Array<{ threatType: string; entries: number; updatedAt: string; nextDiffAt: string | null; lastError: string | null }>
}

/** A refund request in the console's queue: what the refund must match, and how it was settled. */
export interface RefundRequestRow {
  id: string
  account: string
  handle: string
  kind: RefundKind
  /** The late payment, for an `unapplied` request. */
  event: string | null
  reason: string | null
  status: RefundStatus
  details: AccountRefundRequest['details']
  createdAt: string
  refundReference: string | null
  refundEvent: string | null
  decidedBy: string | null
  decidedAt: string | null
  /** Exactly what to send, per purchase. */
  lines: RefundLine[]
  /** Unstarted months asked for, and the first of them has begun since: decline it, and the holder can ask again. */
  monthStarted: boolean
  /** A request from before per-purchase lines (one late payment): the payment to refund whole. */
  payment: {
    provider: string | null
    months: number | null
    amountPence: number | null
    paidAt: string | null
    digest: string | null
    payer: string | null
    coinType: string | null
    amount: string | null
    method: string | null
    checkout: string | null
  } | null
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
