// WebAuthn between the service's JSON (webauthn-rs: `{ publicKey: { … } }`, binary fields as base64url) and the browser's API (binary
// fields as ArrayBuffers). The browser's own converters (`PublicKeyCredential.parseCreationOptionsFromJSON`,
// `parseRequestOptionsFromJSON`, `credential.toJSON()`) are used where they exist; otherwise a small base64url converter does it.

type Json = Record<string, unknown>

/** base64url (or standard base64, padded or not) to bytes. */
export function fromBase64url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/** Bytes to base64url without padding. */
export function toBase64url(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The options object inside webauthn-rs's `{ publicKey }` wrapper (or the object itself). */
function inner(options: Json): Json {
  const pk = options.publicKey
  return pk && typeof pk === 'object' ? (pk as Json) : options
}

function bin(v: unknown): ArrayBuffer {
  if (typeof v !== 'string') throw new Error('expected a base64url string')
  return fromBase64url(v)
}

function descriptors(v: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map((d: Json) => ({ ...(d as object), id: bin(d.id) }) as PublicKeyCredentialDescriptor)
}

interface JsonParsers {
  parseCreationOptionsFromJSON?: (o: unknown) => PublicKeyCredentialCreationOptions
  parseRequestOptionsFromJSON?: (o: unknown) => PublicKeyCredentialRequestOptions
}

function parsers(): JsonParsers {
  return (typeof PublicKeyCredential === 'undefined' ? {} : PublicKeyCredential) as unknown as JsonParsers
}

/** `navigator.credentials.create` options from the service's registration options. */
export function creationOptions(options: Json, p: JsonParsers = parsers()): PublicKeyCredentialCreationOptions {
  const o = inner(options)
  if (p.parseCreationOptionsFromJSON) return p.parseCreationOptionsFromJSON(o)
  const user = o.user as Json
  return {
    ...(o as object),
    challenge: bin(o.challenge),
    user: { ...(user as object), id: bin(user.id) },
    excludeCredentials: descriptors(o.excludeCredentials),
  } as PublicKeyCredentialCreationOptions
}

/** `navigator.credentials.get` options from the service's authentication options. */
export function requestOptions(options: Json, p: JsonParsers = parsers()): PublicKeyCredentialRequestOptions {
  const o = inner(options)
  if (p.parseRequestOptionsFromJSON) return p.parseRequestOptionsFromJSON(o)
  return { ...(o as object), challenge: bin(o.challenge), allowCredentials: descriptors(o.allowCredentials) } as PublicKeyCredentialRequestOptions
}

/** A credential as the JSON the service reads (`credential.toJSON()`, or the same shape built by hand). */
export function credentialJson(cred: PublicKeyCredential): Json {
  const withJson = cred as PublicKeyCredential & { toJSON?: () => Json }
  if (typeof withJson.toJSON === 'function') return withJson.toJSON() as unknown as Json
  const r = cred.response as AuthenticatorResponse & {
    attestationObject?: ArrayBuffer
    authenticatorData?: ArrayBuffer
    signature?: ArrayBuffer
    userHandle?: ArrayBuffer | null
    getTransports?: () => string[]
  }
  const response: Json = { clientDataJSON: toBase64url(r.clientDataJSON) }
  if (r.attestationObject) {
    response.attestationObject = toBase64url(r.attestationObject)
    if (typeof r.getTransports === 'function') response.transports = r.getTransports()
  }
  if (r.authenticatorData) response.authenticatorData = toBase64url(r.authenticatorData)
  if (r.signature) response.signature = toBase64url(r.signature)
  if (r.userHandle) response.userHandle = toBase64url(r.userHandle)
  return {
    id: cred.id,
    rawId: toBase64url(cred.rawId),
    type: cred.type,
    response,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    extensions: cred.getClientExtensionResults?.() ?? {},
  }
}

export interface Credentials {
  create(o: CredentialCreationOptions): Promise<Credential | null>
  get(o: CredentialRequestOptions): Promise<Credential | null>
}

function browserCredentials(): Credentials {
  if (typeof navigator === 'undefined' || !navigator.credentials) throw new Error('This browser does not support passkeys.')
  return navigator.credentials
}

/** Run a registration ceremony and return the credential JSON. */
export async function createPasskey(options: Json, creds: Credentials = browserCredentials()): Promise<Json> {
  const cred = await creds.create({ publicKey: creationOptions(options) })
  if (!cred) throw new Error('No passkey was created.')
  return credentialJson(cred as PublicKeyCredential)
}

/** Run an authentication ceremony and return the credential JSON. */
export async function getPasskey(options: Json, creds: Credentials = browserCredentials()): Promise<Json> {
  const cred = await creds.get({ publicKey: requestOptions(options) })
  if (!cred) throw new Error('No passkey was chosen.')
  return credentialJson(cred as PublicKeyCredential)
}

/** Whether this browser can make passkeys at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials
}
