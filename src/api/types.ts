// The service's JSON shapes (camelCase), as crates/api/src/hosted/app.rs and admin.rs write them. Times are RFC 3339 strings.

import type { Issue } from './errors.js'

/** How sign-up is offered: closed, by invite, or open to anyone. */
export type SignupMode = 'closed' | 'invite' | 'open'

/** `GET /api/v1/instance`: what this deployment offers. Every operator value the app shows comes from here. */
export interface Instance {
  /** What this deployment calls the product. */
  product: string
  version: string
  /** The host the app is served on. */
  appHost: string
  /** The domain tenant pages are served under. */
  pagesDomain: string
  /** How sign-up is offered. */
  signup: SignupMode
  /** Whether pages may link to third parties. */
  thirdPartyPages: boolean
  /** The terms version people accept at sign-up. */
  termsVersion: string
  /** The age a person must confirm. */
  minimumAge: number
  /** The price of a month, in pence. */
  pricePence: number
  currency: string
  /** The providers a person may pay through. */
  billingProviders: string[]
  /** Whether custom domains are offered. */
  customDomains: boolean
  /** Whether the page is also published for federation. */
  federation: boolean
  /** The sign-in methods offered. */
  authenticators: string[]
  /** The Sui network the wallet must be on. */
  suiNetwork: string
  /** The Sui full node the wallet uses for `suiNetwork` (the service's SUI_RPC_URL; the public one by default; null for localnet). */
  suiRpcUrl?: string | null
}

/** `GET /api/v1/limits`: every bound the page parser enforces. */
export interface Limits {
  /** The largest page document, in bytes. */
  manifestBytes: number
  displayName: number
  /** The longest handle. */
  handle: number
  bio: number
  pronouns: number
  linkTitle: number
  groupTitle: number
  linkDescription: number
  /** The most links on a page. */
  links: number
  /** The most groups on a page. */
  groups: number
  id: number
  contacts: number
  support: number
  label: number
  urlBytes: number
  /** Handles that cannot be taken. */
  reservedHandles: string[]
  /** The icon names a link may use. */
  icons: string[]
}

/** An account as the service reports it: handle, status, billing entitlement, country, the page address and the terms version accepted. */
export interface Account {
  id: string
  handle: string
  /** Active, suspended or deleted. */
  status: 'active' | 'suspended' | 'deleted'
  /** True for an account the operator waives payment for. */
  free: boolean
  /** When the paid period ends, if any. */
  paidUntil: string | null
  /** True while the account may publish. */
  entitled: boolean
  /** The account's country, if given. */
  country: string | null
  createdAt: string
  /** The address of the account's page. */
  pageUrl: string
  termsVersion: string
  /** Why and until when the account is suspended, if it is. */
  suspension: { kind: string | null; until: string | null } | null
}

/** `GET /api/v1/me`. */
export interface Me extends Account {
  /** The passkeys on the account. */
  passkeys: Array<{ id: string; name: string }>
  /** The linked Sui wallet addresses. */
  wallets: string[]
  /** How many one-time recovery codes remain. */
  recoveryCodesLeft: number
}

/** WebAuthn options as webauthn-rs writes them (`{ publicKey: { … } }`, binary fields in base64url). */
export type WebAuthnOptionsJson = Record<string, unknown>

/** The start of a passkey ceremony: the service's challenge and the WebAuthn options for the browser. */
export interface CeremonyStart {
  challenge: string
  options: WebAuthnOptionsJson
}

/** The start of a wallet sign-in or link: a challenge and the exact message the wallet must sign. */
export interface WalletChallenge {
  challenge: string
  message: string
}

/** What sign-up sends: the handle, the age and terms confirmations, an optional country and invite, and how the person will sign in (a passkey or a Sui wallet). */
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

/** A finished sign-up: the new account and its one-time recovery codes (shown once). */
export interface SignupFinished {
  account: Account
  recoveryCodes: string[]
}

/** A finished sign-in: the account and how many recovery codes remain, when the person used one. */
export interface SignedIn {
  account: Account
  recoveryCodesLeft?: number
}

/** What link screening concluded: not checked, clean, flagged or unknown. */
export type Verdict = 'unchecked' | 'clean' | 'flagged' | 'unknown'

/** The screening result for one link. */
export interface Screening {
  url: string
  verdict: Verdict
  detail: string | null
}

/** `GET /api/v1/page`. `issues` are the parser's warnings, or its errors when the stored draft no longer passes. */
export interface PageState {
  /** The stored draft document (untyped here: the editor owns its shape). */
  draft: unknown
  /** True when a version is online. */
  published: boolean
  /** The draft's version number. */
  version: number
  updatedAt: string | null
  publishedAt: string | null
  url: string
  issues: Issue[]
  /** The screening result for each link. */
  screening: Screening[]
  /** True when the draft differs from what is online. */
  changed: boolean
}

/** A published page: its version, its address, the links held back by screening and whether it is online. */
export interface Published {
  version: number
  url: string
  hidden: Screening[]
  online: boolean
}

/** One way to pay: a provider, who sells (the operator or a merchant of record), its fees and the months it covers. */
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

/** A refund request as the account holder sees its progress. */
export interface RefundRequestState {
  id: string
  status: RefundStatus
  refundReference: string | null
  at: string
  decidedAt: string | null
}

/** One line of billing history: a payment or a refund, its months and its amount in pence. */
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

/** Open Payments: the step that sends the buyer to their wallet to approve, with the amounts shown there. */
export interface OpenPaymentsRedirect {
  kind: 'open-payments'
  step: 'redirect'
  redirect: string
  wallet: string
  debitAmount: OpenPaymentsAmount
  receiveAmount: OpenPaymentsAmount
}

/** Open Payments: the checkout after the wallet's approval, and the outgoing payment's state. */
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

/** Why a refund is asked for: cancelling, an unstarted purchase, or one that was never applied. */
export type RefundKind = 'cancel' | 'unstarted' | 'unapplied'
/** Where a refund request stands: open, refunded, withdrawn or declined. */
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

/** What may be asked back now, worked out exactly: the kind, the months, the date and each line. */
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

/** What a refund request sends: the kind, the purchase, the months and the reason. */
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

/** A started checkout: its id, the amount in pence and what the provider's widget needs in the browser. */
export interface CheckoutStarted {
  checkout: string
  amountPence: number
  client: CheckoutClient
}

/** A checkout's state: open, paid, expired or cancelled. */
export type CheckoutStatusName = 'open' | 'paid' | 'expired' | 'cancelled'

/** A checkout's state, with the months and the new paid-until date once it is paid. */
export interface CheckoutStatus {
  checkout: string
  status: CheckoutStatusName
  months: number
  paidUntil: string | null
}

/** A DNS TXT record the person adds to prove they own a custom domain. */
export interface TxtRecord {
  name: string
  type: 'TXT'
  value: string
}

/** A custom domain: its host name, its verification status and the TXT record to add. */
export interface Domain {
  hostname: string
  status: 'pending' | 'verified' | 'failed'
  verifiedAt: string | null
  record: TxtRecord
}

/** The account's custom domains, and whether the instance offers them. */
export interface Domains {
  enabled: boolean
  domains: Domain[]
}

/** The invites an account holds, and how many have been used. */
export interface HeldInvites {
  codes: Array<{ code: string; expiresAt: string }>
  redeemed: number
}

/** A statement of reasons for a moderation decision (what was decided, why and when). */
export interface Statement {
  report: string
  reason: string
  decision: string | null
  statement: string | null
  decidedAt: string | null
}

/** An appeal against a decision, and where it stands. */
export interface AppealRecord {
  appeal: string
  report: string | null
  status: 'open' | 'upheld' | 'rejected'
  statement: string | null
  at: string
}

/** The statements and appeals for an account. */
export interface Statements {
  statements: Statement[]
  appeals: AppealRecord[]
}

/** What the report form sends: the page, the link, the reason, details and an optional way to reply. */
export interface ReportBody {
  page: string
  url?: string
  reason: string
  details: string
  contact?: string
}

// ── the console (/api/v1/admin) ─────────────────────────────────────────────────────────────────────────────────────

/** The signed-in operator of the console. */
export interface Operator {
  subject: string
  name: string
  /** Which sign-in path was used: `access` (the access gate) or `oidc` (the platform's identity provider, which signs out through the console). Absent from an older service. */
  via?: 'access' | 'oidc'
}

/** The console's overview: counts of accounts, pages, reports, appeals and links, and storage used. */
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

/** One account in the console's list, with its suspension state. */
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

/** One account in full: its page, invitees, invites, billing and domains. */
export interface AccountDetail {
  account: AccountRow
  page: { published: boolean; version: number; publishedAt: string | null; document: unknown } | null
  invitees: AccountRow[]
  invites: Array<{ id: string; createdAt: string; expiresAt: string; redeemedBy: string | null; revokedAt: string | null }>
  billing: Array<{ provider: string; kind: string; months: number; amountPence: number; at: string }>
  domains: Array<{ hostname: string; status: string }>
  audit: Array<{ at: string; actor: string; action: string; details: unknown }>
}

/** One invite: who holds it, which selection it came from, the note and who made it. */
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

/** Invites just issued: the codes (shown once) and when they expire. */
export interface Issued {
  codes: string[]
  issued: number
  expiresAt: string
}

/** The rules that pick accounts for invites: a minimum age, published, paid, invitees in good standing and a tag. */
export interface Criteria {
  minAgeDays?: number | null
  published?: boolean | null
  paid?: boolean | null
  inviteesInGoodStanding?: boolean | null
  tag?: string | null
}

/** A saved set of criteria with a name. */
export interface Selection {
  id: string
  name: string
  criteria: Criteria
  createdBy: string
  createdAt: string
}

/** One report in the console's queue. */
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

/** One appeal in the console's queue. */
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

/** One entry of the blocklist: a pattern, its kind, why and who added it. */
export interface BlockEntry {
  pattern: string
  kind: 'host' | 'url'
  reason: string
  addedBy: string
  addedAt: string
}

/** One row of the audit trail: who did what to which subject, with details. */
export interface AuditEntry {
  id: number | string
  at: string
  actor: string
  action: string
  subject: string
  details: unknown
}
