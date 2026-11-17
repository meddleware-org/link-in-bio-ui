// The only code that talks to the network: same-origin `/api/v1/…` (relative paths, so the page's own origin), the session cookie the
// browser holds (`credentials: 'same-origin'`; this code never reads, stores or sends a token), and the request header on every write.
// The hosted service refuses a write without `X-Link-In-Bio-Request`; the loopback editor backend wants `X-Link-In-Bio-Editor` as well.

import { ApiError, readIssues } from './errors.js'

export const REQUEST_HEADER = 'X-Link-In-Bio-Request'
export const EDITOR_HEADER = 'X-Link-In-Bio-Editor'

export type Query = Record<string, string | number | boolean | null | undefined>

export interface HttpOptions {
  /** Injected for tests and embedding; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Extra headers on every write (the loopback editor's own header). */
  writeHeaders?: Record<string, string>
}

export interface RequestOptions {
  query?: Query
  /** A JSON body. */
  json?: unknown
  /** A raw body (a picture), sent with `contentType`. */
  body?: Blob | ArrayBuffer | Uint8Array<ArrayBuffer>
  contentType?: string
  /** Return the response text instead of parsing JSON (the local preview's HTML). */
  text?: boolean
}

export interface Http {
  request<T>(method: string, path: string, opts?: RequestOptions): Promise<T>
  get<T>(path: string, query?: Query): Promise<T>
  post<T>(path: string, json?: unknown): Promise<T>
  put<T>(path: string, json?: unknown): Promise<T>
  del<T>(path: string, json?: unknown, query?: Query): Promise<T>
}

/** `path` with its query string; empty values are left out. Only relative `/api/` paths are accepted, so nothing leaves the origin. */
export function url(path: string, query?: Query): string {
  if (!path.startsWith('/api/')) throw new Error(`not an API path: ${path}`)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  return `${path}${s ? `?${s}` : ''}`
}

export function createHttp(opts: HttpOptions = {}): Http {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))

  async function request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { accept: o.text ? 'text/html' : 'application/json' }
    const write = method !== 'GET' && method !== 'HEAD'
    if (write) Object.assign(headers, { [REQUEST_HEADER]: '1' }, opts.writeHeaders)
    let body: BodyInit | undefined
    if (o.json !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(o.json)
    } else if (o.body !== undefined) {
      headers['content-type'] = o.contentType ?? 'application/octet-stream'
      body = o.body as BodyInit
    }
    let res: Response
    try {
      // `manual`: an access gate that sends the browser to its sign-in page must not be followed (it is cross-origin); it means
      // the person is not signed in to the gate.
      res = await doFetch(url(path, o.query), { method, headers, body, credentials: 'same-origin', redirect: 'manual', cache: 'no-store' })
    } catch {
      throw new ApiError(0, null, '')
    }
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) throw new ApiError(401, 'redirected', '')
    if (res.status === 204) return undefined as T
    const type = res.headers.get('content-type') ?? ''
    if (res.ok && o.text) return (await res.text()) as T
    if (!type.includes('json')) {
      // An HTML page where JSON belongs: an access gate's sign-in page, or a server that does not have this route.
      throw new ApiError(res.ok ? 401 : res.status, 'not_json', '')
    }
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
    if (res.ok) return payload as T
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    // The hosted service: `{error, code, issues}`. The loopback editor: `{ok: false, errors, warnings}` or `{ok: false, error}`.
    const issues = readIssues(p.issues ?? p.errors)
    const code = typeof p.code === 'string' ? p.code : issues.length ? 'invalid_page' : null
    const message = typeof p.error === 'string' ? p.error : issues.length ? 'The page document has problems.' : ''
    throw new ApiError(res.status, code, message, issues)
  }

  return {
    request,
    get: (path, query) => request('GET', path, { query }),
    post: (path, json) => request('POST', path, { json: json ?? {} }),
    put: (path, json) => request('PUT', path, { json: json ?? {} }),
    del: (path, json, query) => request('DELETE', path, { json, query }),
  }
}
