// The operator console's API (`/api/v1/admin/…`, ADMIN_ROUTES), one typed function per route. The access gate in front of the admin
// host holds the operator's session; this code sends no credential of its own.

import type { Http } from './http.js'
import type {
  AccountDetail,
  AccountRow,
  AppealRow,
  AuditEntry,
  BlockEntry,
  Criteria,
  InviteRow,
  Issued,
  Operator,
  Overview,
  ReportRow,
  Selection, RefundRequestRow } from './types.js'

const enc = encodeURIComponent
const P = '/api/v1/admin'

export function adminApi(http: Http) {
  return {
    me: () => http.get<Operator>(`${P}/me`),
    overview: () => http.get<Overview>(`${P}/overview`),
    accounts: (q: string, offset = 0) => http.get<{ accounts: AccountRow[] }>(`${P}/accounts`, { q, offset: offset || undefined }),
    account: (id: string) => http.get<AccountDetail>(`${P}/accounts/${enc(id)}`),
    setFlags: (id: string, f: { operator: boolean; free: boolean; mayShareInvites: boolean; tags: string[] }) =>
      http.put<void>(`${P}/accounts/${enc(id)}/flags`, f),
    suspend: (id: string, b: { kind: 'policy' | 'legal'; reason: string; days?: number; report?: string; statement: string }) =>
      http.post<void>(`${P}/accounts/${enc(id)}/suspend`, b),
    unsuspend: (id: string) => http.post<void>(`${P}/accounts/${enc(id)}/unsuspend`),
    grant: (id: string, b: { months: number; reason: string }) => http.post<{ paidUntil: string | null }>(`${P}/accounts/${enc(id)}/grant`, b),

    invites: () => http.get<{ invites: InviteRow[] }>(`${P}/invites`),
    issue: (b: { count: number; heldBy?: string; note?: string; expiresInDays?: number }) => http.post<Issued>(`${P}/invites`, b),
    revoke: (id: string) => http.del<void>(`${P}/invites/${enc(id)}`),

    selections: () => http.get<{ selections: Selection[] }>(`${P}/selections`),
    createSelection: (b: { name: string; criteria: Criteria }) => http.post<{ id: string }>(`${P}/selections`, b),
    deleteSelection: (id: string) => http.del<void>(`${P}/selections/${enc(id)}`),
    matches: (id: string) => http.get<{ accounts: AccountRow[] }>(`${P}/selections/${enc(id)}/matches`),
    issueToSelection: (id: string, b: { perAccount: number; expiresInDays?: number }) =>
      http.post<{ accounts: number; codes: number; expiresAt: string }>(`${P}/selections/${enc(id)}/issue`, b),

    reports: (status: string) => http.get<{ reports: ReportRow[] }>(`${P}/reports`, { status }),
    decideReport: (id: string, b: { status: 'actioned' | 'dismissed'; decision: string; statement?: string; hideLink: boolean }) =>
      http.post<void>(`${P}/reports/${enc(id)}/decide`, b),
    appeals: (status: string) => http.get<{ appeals: AppealRow[] }>(`${P}/appeals`, { status }),
    refundRequests: (status: string) => http.get<{ requests: RefundRequestRow[] }>(`${P}/refund-requests`, { status }),
    recordRefund: (id: string, b: { reference: string; note?: string }) =>
      http.post<{ request: RefundRequestRow; paidUntil: string | null }>(`${P}/refund-requests/${enc(id)}/refunded`, b),
    decideAppeal: (id: string, b: { status: 'upheld' | 'rejected'; statement: string; reinstate: boolean }) =>
      http.post<void>(`${P}/appeals/${enc(id)}/decide`, b),

    blocklist: () => http.get<{ entries: BlockEntry[] }>(`${P}/blocklist`),
    block: (b: { pattern: string; kind: 'host' | 'url'; reason: string }) => http.post<void>(`${P}/blocklist`, b),
    unblock: (pattern: string) => http.del<void>(`${P}/blocklist`, undefined, { pattern }),
    linkVerdict: (b: { url: string; verdict: 'clean' | 'flagged' | null }) => http.put<void>(`${P}/links`, b),
    audit: (subject?: string) => http.get<{ entries: AuditEntry[] }>(`${P}/audit`, { subject }),
  }
}

export type AdminApi = ReturnType<typeof adminApi>
