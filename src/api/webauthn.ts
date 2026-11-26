// WebAuthn between the service's JSON (webauthn-rs: `{ publicKey: { … } }`, binary fields as base64url) and the browser's API (binary
// fields as ArrayBuffers). The browser's own converters (`PublicKeyCredential.parseCreationOptionsFromJSON`,
// `parseRequestOptionsFromJSON`, `credential.toJSON()`) are used where they exist; otherwise a small base64url converter does it.

/** A JSON object. */
type Json = Record<string, unknown>

/** base64url (or standard base64, padded or not) to bytes. */
export function fromBase64url(s: string): ArrayBuffer {
  // base64url to standard base64.
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  // Restore the padding base64 expects.
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  // Decode to a binary string.
  const bin = atob(padded)
  // Copy it into bytes.
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/** Bytes to base64url without padding. */
export function toBase64url(buf: ArrayBuffer | ArrayBufferView): string {
  // Normalise a buffer or a view to bytes.
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  // Build a binary string from the bytes.
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  // Encode, then make it URL-safe and drop the padding.
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The options object inside webauthn-rs's `{ publicKey }` wrapper (or the object itself). */
function inner(options: Json): Json {
  // The options may be wrapped as `{ publicKey }`.
  const pk = options.publicKey
  return pk && typeof pk === 'object' ? (pk as Json) : options
}

/** A base64url string to bytes; anything else is an error. */
function bin(v: unknown): ArrayBuffer {
  // A binary field must arrive as a string.
  if (typeof v !== 'string') throw new Error('expected a base64url string')
  return fromBase64url(v)
}

/** Credential descriptors with their ids decoded to bytes. */
function descriptors(v: unknown): PublicKeyCredentialDescriptor[] | undefined {
  // No descriptors.
  if (!Array.isArray(v)) return undefined
  // Each descriptor's id decodes to bytes.
  return v.map((d: Json) => ({ ...(d as object), id: bin(d.id) }) as PublicKeyCredentialDescriptor)
}

/** The browser's own JSON converters, where it has them. */
interface JsonParsers {
  parseCreationOptionsFromJSON?: (o: unknown) => PublicKeyCredentialCreationOptions
  parseRequestOptionsFromJSON?: (o: unknown) => PublicKeyCredentialRequestOptions
}

/** The converters the browser offers, or none. */
function parsers(): JsonParsers {
  // The browser's own converters, when it has them (an empty set otherwise).
  return (typeof PublicKeyCredential === 'undefined' ? {} : PublicKeyCredential) as unknown as JsonParsers
}

/** `navigator.credentials.create` options from the service's registration options. */
export function creationOptions(options: Json, p: JsonParsers = parsers()): PublicKeyCredentialCreationOptions {
  // The options object itself.
  const o = inner(options)
  // Prefer the browser's own converter.
  if (p.parseCreationOptionsFromJSON) return p.parseCreationOptionsFromJSON(o)
  // Otherwise convert by hand: the user id, the challenge and the excluded credentials are binary.
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
  // The browser's own `toJSON`, when it has one.
  const withJson = cred as PublicKeyCredential & { toJSON?: () => Json }
  if (typeof withJson.toJSON === 'function') return withJson.toJSON() as unknown as Json
  // Otherwise read the response's parts by hand (they differ for registration and sign-in).
  const r = cred.response as AuthenticatorResponse & {
    attestationObject?: ArrayBuffer
    authenticatorData?: ArrayBuffer
    signature?: ArrayBuffer
    userHandle?: ArrayBuffer | null
    getTransports?: () => string[]
  }
  // The response, field by field, as base64url.
  const response: Json = { clientDataJSON: toBase64url(r.clientDataJSON) }
  // A registration response.
  if (r.attestationObject) {
    response.attestationObject = toBase64url(r.attestationObject)
    if (typeof r.getTransports === 'function') response.transports = r.getTransports()
  }
  // A sign-in response.
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

/** The two calls this module needs from `navigator.credentials` (replaceable in tests). */
export interface Credentials {
  create(o: CredentialCreationOptions): Promise<Credential | null>
  get(o: CredentialRequestOptions): Promise<Credential | null>
}

/** The browser's credentials container; throws a plain sentence where passkeys are unsupported. */
function browserCredentials(): Credentials {
  // No credentials API: say so in words.
  if (typeof navigator === 'undefined' || !navigator.credentials) throw new Error('This browser does not support passkeys.')
  return navigator.credentials
}

/** Run a registration ceremony and return the credential JSON. */
export async function createPasskey(options: Json, creds: Credentials = browserCredentials()): Promise<Json> {
  // Ask the authenticator to make a passkey.
  const cred = await creds.create({ publicKey: creationOptions(options) })
  // The person dismissed the prompt.
  if (!cred) throw new Error('No passkey was created.')
  return credentialJson(cred as PublicKeyCredential)
}

/** Run an authentication ceremony and return the credential JSON. */
export async function getPasskey(options: Json, creds: Credentials = browserCredentials()): Promise<Json> {
  // Ask the authenticator to sign the challenge.
  const cred = await creds.get({ publicKey: requestOptions(options) })
  // The person dismissed the prompt.
  if (!cred) throw new Error('No passkey was chosen.')
  return credentialJson(cred as PublicKeyCredential)
}

/** Whether this browser can make passkeys at all. */
export function passkeysSupported(): boolean {
  // True when the browser has the API and a credentials container.
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials
}
