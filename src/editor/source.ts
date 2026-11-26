// Where the editor's document comes from and goes to. The editor component knows only this interface, so the same form edits a page on
// the hosted service (the signed-in account's draft) and a page on this computer (`link-in-bio serve --mode local`, the loopback editor
// backend). The local source makes requests to the loopback origin's `/api/v1/…` only; `tests/edit-mode.test.ts` proves it.

// Accept only addresses and paths that are safe to put in an image's `src`.
import { safeHref, safePath } from '@meddleware/web-utils'
// A finding about a page document.
import type { Issue } from '../api/errors.js'
// The HTTP layer, and the loopback editor's own write header.
import { createHttp, EDITOR_HEADER, type Http } from '../api/http.js'
// The typed account API.
import { appApi } from '../api/app.js'
// The limits and the page's state.
import type { Limits, PageState } from '../api/types.js'
// Schema 1's theme options, and the normaliser of a document.
import { SCHEMA_1_THEME, normalise, type PageDoc, type ThemeOptions } from './model.js'

/** How the preview frame gets the rendered page: a URL to load, or the HTML itself. */
export type Preview = { src: string } | { html: string }

/** What a source loads: the document, the parser's findings and (hosted only) the page's state. */
export interface Loaded {
  doc: PageDoc
  /** The parser's findings about the stored document (warnings, or errors when it no longer passes). */
  issues: Issue[]
  /** The hosted page's state (published, version, screening …); none for the local editor. */
  page?: PageState
}

/** Where the editor's document comes from and goes to; the editor knows only this. */
export interface EditorSource {
  readonly kind: 'hosted' | 'local'
  load(): Promise<Loaded>
  /** Save the document. Resolves with the parser's warnings; rejects with an `ApiError` carrying `issues` when it is refused. */
  save(doc: unknown): Promise<{ warnings: Issue[] }>
  limits(): Promise<Limits>
  themeOptions(): Promise<ThemeOptions>
  /** Store a picture; resolves with the value for `identity.avatar` and, when there is one, a URL to show it. */
  uploadAvatar(file: Blob): Promise<{ avatar: string; url: string | null }>
  /** The rendered page for the sandboxed preview frame (`doc` is the document being edited; the hosted service renders the saved draft). */
  preview(doc: unknown, generation: number): Promise<Preview>
  /** The handle is the account's on the hosted service, so it cannot be edited there. */
  readonly handleEditable: boolean
}

/** The hosted service as a source: the signed-in account's draft. */
export function hostedSource(http: Http): EditorSource {
  // The typed API over the hosted HTTP layer.
  const api = appApi(http)
  return {
    kind: 'hosted',
    handleEditable: false,
    async load() {
      // The signed-in account's draft.
      const page = await api.page()
      return { doc: normalise(page.draft), issues: page.issues, page }
    },
    async save(doc) {
      // Save it; the service answers with warnings or refuses with issues.
      const r = await api.savePage(doc)
      return { warnings: r.warnings ?? [] }
    },
    limits: () => api.limits(),
    // The hosted API has no theme-options route; the options are schema 1's.
    themeOptions: async () => SCHEMA_1_THEME,
    async uploadAvatar(file) {
      // Upload the picture.
      const r = await api.uploadAvatar(file)
      // The URL goes into an <img src>: a path on this site (what the service sends) or an https URL, nothing else.
      return { avatar: r.avatar, url: safePath(r.url) ?? safeHref(r.url) ?? null }
    },
    // The saved draft, rendered by the service; the generation makes the frame load it again after each save.
    preview: async (_doc, generation) => ({ src: `${api.previewPath}?v=${generation}` }),
  }
}

/** What the loopback backend answers to a save or an upload. */
interface LocalResult {
  ok: boolean
  errors?: Issue[]
  warnings?: Issue[]
  avatar?: string
}

/** The loopback editor backend as a source: same origin, its own write header as well as the app's. */
export function localSource(opts: { fetch?: typeof fetch } = {}): EditorSource {
  // The loopback origin's HTTP layer, with its own write header as well as the app's.
  const http = createHttp({ fetch: opts.fetch, writeHeaders: { [EDITOR_HEADER]: '1' } })
  return {
    kind: 'local',
    handleEditable: true,
    async load() {
      // The document on this computer.
      const doc = await http.get<unknown>('/api/v1/manifest')
      return { doc: normalise(doc), issues: [] }
    },
    async save(doc) {
      // Save it; the backend answers `{ ok, warnings }` or refuses with `{ errors }`.
      const r = await http.request<LocalResult>('PUT', '/api/v1/manifest', { json: doc })
      return { warnings: r.warnings ?? [] }
    },
    limits: () => http.get<Limits>('/api/v1/limits'),
    async themeOptions() {
      // The backend serves the theme options; they are laid over schema 1's.
      const r = await http.get<{ options: ThemeOptions }>('/api/v1/theme/options')
      return { ...SCHEMA_1_THEME, ...r.options }
    },
    async uploadAvatar(file) {
      // Store the picture next to the document; there is no URL to show.
      const r = await http.request<LocalResult>('POST', '/api/v1/avatar', { body: file, contentType: file.type || 'application/octet-stream' })
      return { avatar: r.avatar ?? '', url: null }
    },
    // The unsaved document, rendered by the backend with its sprite inlined (a sandboxed frame cannot load an external one).
    preview: async (doc) => ({ html: await http.request<string>('POST', '/api/v1/preview', { json: doc, text: true }) }),
  }
}
