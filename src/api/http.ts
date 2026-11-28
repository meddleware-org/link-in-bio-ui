// The only code that talks to the network: same-origin `/api/v1/…` (relative paths, so the page's own origin), the session cookie the
// browser holds (`credentials: 'same-origin'`; this code never reads, stores or sends a token), and the request header on every write.
// The hosted service refuses a write without `X-Link-In-Bio-Request`; the loopback editor backend wants `X-Link-In-Bio-Editor` as well.

// The one error type, and the reader of a refused page document's issues.
// A check that a path is a safe same-site link.
import { safePath } from '@meddleware/web-utils'
import { ApiError, readIssues } from './errors.js'

/** The header the hosted service demands on every write (a CSRF defence for the session cookie). */
export const REQUEST_HEADER = 'X-Link-In-Bio-Request'
/** The extra header the loopback editor backend wants on writes. */
export const EDITOR_HEADER = 'X-Link-In-Bio-Editor'

/** Query parameters; a value that is undefined, null or empty is left out. */
export type Query = Record<string, string | number | boolean | null | undefined>

/** What a test, an embedding or the loopback editor can set. */
export interface HttpOptions {
  /** Injected for tests and embedding; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Extra headers on every write (the loopback editor's own header). */
  writeHeaders?: Record<string, string>
  /** Give up on a request after this long (default 30 s); it then fails like an unreachable server (status 0). */
  timeoutMs?: number
}

/** How long one request may take before it is abandoned. */
export const DEFAULT_TIMEOUT_MS = 30_000

/** What one request may carry: a query, a JSON body or a raw body, and whether to read the answer as text. */
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

/** The calls the app makes. Every path is a relative `/api/` path. */
export interface Http {
  request<T>(method: string, path: string, opts?: RequestOptions): Promise<T>
  get<T>(path: string, query?: Query): Promise<T>
  post<T>(path: string, json?: unknown): Promise<T>
  put<T>(path: string, json?: unknown): Promise<T>
  del<T>(path: string, json?: unknown, query?: Query): Promise<T>
}

/** `path` with its query string; empty values are left out. Only relative `/api/` paths (and the console's own `/auth/logout`) are accepted, so nothing leaves the origin. */
export function url(path: string, query?: Query): string {
  // Only relative API paths are accepted, so a request can never leave the origin (the operator console's sign-out route is the one other).
  if (!path.startsWith('/api/') && path !== '/auth/logout') throw new Error(`not an API path: ${path}`)
  // Build the query string from the given values.
  const qs = new URLSearchParams()
  // Leave out values that are not set.
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  // The encoded query, empty when there is none.
  const s = qs.toString()
  return `${path}${s ? `?${s}` : ''}`
}

/** Make the HTTP layer: same-origin, the session cookie held by the browser (never read here), the request header on writes, and a timeout on every request. */
export function createHttp(opts: HttpOptions = {}): Http {
  // The fetch to use: the injected one in tests, otherwise the global.
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  // The longest one request may take.
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  /** Make one request and return its answer, or throw an `ApiError`. */
  async function request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    // Ask for JSON, or for HTML where the local preview is wanted.
    const headers: Record<string, string> = { accept: o.text ? 'text/html' : 'application/json' }
    // A write is anything but GET and HEAD.
    const write = method !== 'GET' && method !== 'HEAD'
    // Every write carries the request header the service demands (and the loopback editor's own, when given).
    if (write) Object.assign(headers, { [REQUEST_HEADER]: '1' }, opts.writeHeaders)
    // The request body, if any.
    let body: BodyInit | undefined
    // A JSON body.
    if (o.json !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(o.json)
    // A raw body, such as a picture.
    } else if (o.body !== undefined) {
      headers['content-type'] = o.contentType ?? 'application/octet-stream'
      body = o.body as BodyInit
    }
    // The answer.
    let res: Response
    try {
      // `manual`: an access gate that sends the browser to its sign-in page must not be followed (it is cross-origin); it means
      // the person is not signed in to the gate.
      // `signal`: no request waits for ever (a stalled connection ends as "could not be reached", and the person can try again).
      res = await doFetch(url(path, o.query), {
        method,
        headers,
        body,
        credentials: 'same-origin',
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })
    // No answer at all (offline, refused, timed out): status 0 so the words say the server could not be reached.
    } catch {
      throw new ApiError(0, null, '')
    }
    // A redirect means an access gate wants a sign-in: treat it as signed out.
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) throw new ApiError(401, 'redirected', '')
    // No content: nothing to parse.
    if (res.status === 204) return undefined as T
    // The content type tells JSON from an HTML page.
    const type = res.headers.get('content-type') ?? ''
    // The caller asked for text (the local preview's HTML).
    if (res.ok && o.text) return (await res.text()) as T
    // Not JSON where JSON belongs.
    if (!type.includes('json')) {
      // An HTML page where JSON belongs: an access gate's sign-in page, or a server that does not have this route.
      throw new ApiError(res.ok ? 401 : res.status, 'not_json', '')
    }
    // The parsed body, or null when it is not JSON.
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
    // A success: the body is the answer.
    if (res.ok) return payload as T
    // An error body, read defensively because it is untrusted.
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    // The hosted service: `{error, code, issues}`. The loopback editor: `{ok: false, errors, warnings}` or `{ok: false, error}`.
    // The page document's problems, if the answer lists any.
    const issues = readIssues(p.issues ?? p.errors)
    // The machine code, or `invalid_page` when only issues came back.
    const code = typeof p.code === 'string' ? p.code : issues.length ? 'invalid_page' : null
    // The service's plain words, or a fixed sentence when it listed issues.
    const message = typeof p.error === 'string' ? p.error : issues.length ? 'The page document has problems.' : ''
    // The status, the code, the words and the issues.
    // A 401 may name where a sign-in starts; only a short same-site /auth/ path is believed (the body is untrusted).
    const hint = res.status === 401 && typeof p.signIn === 'string' && p.signIn.startsWith('/auth/') && safePath(p.signIn) ? p.signIn : null
    throw new ApiError(res.status, code, message, issues, hint)
  }

  return {
    request,
    // The verbs; a write without a body sends an empty object, because the API expects JSON.
    get: (path, query) => request('GET', path, { query }),
    post: (path, json) => request('POST', path, { json: json ?? {} }),
    put: (path, json) => request('PUT', path, { json: json ?? {} }),
    del: (path, json, query) => request('DELETE', path, { json, query }),
  }
}
