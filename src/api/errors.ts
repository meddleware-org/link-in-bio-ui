// The one error type of the API layer. The service answers every failure as `{ "error": "<plain words>", "code": "<machine code>" }`,
// and a page document it refuses also carries `issues` (each with a JSON path such as `items/2/url`, a stable code and a sentence).

/** One finding about a page document: where (`items/2/url`), what (`url_scheme`), and a sentence for the person editing it. */
export interface Issue {
  path: string
  code: string
  message: string
}

export class ApiError extends Error {
  /** The HTTP status, or 0 when no answer arrived. */
  readonly status: number
  /** The service's machine code (`invalid_page`, `conflict`, `unauthorized` …), when it sent one. */
  readonly code: string | null
  /** The page document's problems, for `invalid_page`. */
  readonly issues: Issue[]

  constructor(status: number, code: string | null, message: string, issues: Issue[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues
  }

  /** The service did not answer as an API (an access gate's sign-in page, a redirect, or a 401). */
  get signedOut(): boolean {
    return this.status === 401 || this.code === 'not_json' || this.code === 'redirected'
  }
}

/** Reads an `issues` array loosely: anything that is not a well-formed issue is dropped. */
export function readIssues(v: unknown): Issue[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .filter((i) => typeof i.path === 'string' && typeof i.message === 'string')
    .map((i) => ({ path: i.path as string, code: typeof i.code === 'string' ? i.code : '', message: i.message as string }))
}

/**
 * A sentence for a person. The service writes its `error` in plain words for the cases a person can act on (a taken handle, a refused
 * value, a conflict), so those are shown as they are; everything else gets a fixed sentence, so no internals reach the page.
 */
export function describeError(e: unknown): string {
  if (!(e instanceof ApiError)) {
    if (e instanceof Error && /NotAllowedError|AbortError/.test(e.name)) return 'The browser did not complete the request (it was cancelled or timed out).'
    return 'Something went wrong. Reload the page and try again.'
  }
  switch (e.status) {
    case 0:
      return 'The server could not be reached. Check your connection and try again.'
    case 401:
      return 'You are signed out. Sign in again.'
    case 404:
      return e.code === 'no_route' ? 'This server does not offer that.' : 'That no longer exists. Reload and check.'
    case 413:
      return 'That is too large to send.'
    case 400:
    case 403:
    case 409:
    case 422:
      return e.message || 'The server refused that. Check the form and try again.'
    case 503:
      return 'The service is temporarily unavailable. Try again in a moment; nothing was changed.'
    default:
      return e.status >= 500 ? 'The server had a problem. Try again; if it persists, report it.' : e.message || `Unexpected answer (${e.status}).`
  }
}
