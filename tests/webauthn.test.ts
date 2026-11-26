// Tests of the WebAuthn conversions (src/api/webauthn.ts): base64url, the options from the service's JSON (with and without the browser's own parsers), credentials as JSON, and the
// ceremonies through a replaceable credentials container.
import { describe, expect, it, vi } from 'vitest'
import { creationOptions, credentialJson, createPasskey, fromBase64url, getPasskey, requestOptions, toBase64url } from '../src/api/webauthn.js'

const bytes = (b: ArrayBuffer | BufferSource) => Array.from(new Uint8Array(b as ArrayBuffer))
const REG = {
  publicKey: {
    rp: { id: 'app.example.link', name: 'Example' },
    user: { id: toBase64url(new Uint8Array([1, 2, 3, 250, 251])), name: 'ada', displayName: 'ada' },
    challenge: toBase64url(new Uint8Array([9, 8, 7, 255, 254, 253])),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    excludeCredentials: [{ type: 'public-key', id: toBase64url(new Uint8Array([42, 43])) }],
    authenticatorSelection: { userVerification: 'required' },
  },
}

describe('base64url', () => {
  // Round-trips every byte value, without padding, and reads standard base64 too.
  it('round-trips every byte value, without padding, and reads standard base64 too', () => {
    const all = new Uint8Array(256).map((_, i) => i)
    const s = toBase64url(all)
    expect(s).not.toMatch(/[+/=]/)
    expect(bytes(fromBase64url(s))).toEqual(Array.from(all))
    expect(bytes(fromBase64url('+/8='))).toEqual([251, 255])
    expect(bytes(fromBase64url('-_8'))).toEqual([251, 255])
  })
})

describe('WebAuthn options from the service’s JSON', () => {
  // Unwraps { publicKey } and converts the binary fields itself when the browser has no JSON parser.
  it('unwraps { publicKey } and converts the binary fields itself when the browser has no JSON parser', () => {
    const o = creationOptions(REG, {})
    expect(bytes(o.challenge)).toEqual([9, 8, 7, 255, 254, 253])
    expect(bytes(o.user.id)).toEqual([1, 2, 3, 250, 251])
    expect(bytes(o.excludeCredentials![0]!.id)).toEqual([42, 43])
    expect(o.rp).toEqual({ id: 'app.example.link', name: 'Example' })
    expect(o.authenticatorSelection).toEqual({ userVerification: 'required' })

    const r = requestOptions({ publicKey: { challenge: 'AQI', allowCredentials: [{ type: 'public-key', id: 'Kis' }], userVerification: 'required' } }, {})
    expect(bytes(r.challenge)).toEqual([1, 2])
    expect(bytes(r.allowCredentials![0]!.id)).toEqual([42, 43])
    expect(requestOptions({ publicKey: { challenge: 'AQI' } }, {}).allowCredentials).toBeUndefined()
  })

  // Uses the browser’s own parsers when they exist, handing them the inner options.
  it('uses the browser’s own parsers when they exist, handing them the inner options', () => {
    const parseCreationOptionsFromJSON = vi.fn(() => ({ parsed: 'create' }) as unknown as PublicKeyCredentialCreationOptions)
    const parseRequestOptionsFromJSON = vi.fn(() => ({ parsed: 'get' }) as unknown as PublicKeyCredentialRequestOptions)
    expect(creationOptions(REG, { parseCreationOptionsFromJSON })).toEqual({ parsed: 'create' })
    expect(parseCreationOptionsFromJSON).toHaveBeenCalledWith(REG.publicKey)
    expect(requestOptions({ publicKey: { challenge: 'AQI' } }, { parseRequestOptionsFromJSON })).toEqual({ parsed: 'get' })
    expect(parseRequestOptionsFromJSON).toHaveBeenCalledWith({ challenge: 'AQI' })
  })
})

describe('a credential as JSON', () => {
  const buf = (...b: number[]) => new Uint8Array(b).buffer
  // Uses credential.toJSON() when it exists.
  it('uses credential.toJSON() when it exists', () => {
    const cred = { toJSON: () => ({ id: 'from-browser' }) } as unknown as PublicKeyCredential
    expect(credentialJson(cred)).toEqual({ id: 'from-browser' })
  })

  // Builds the same shape by hand otherwise: a registration and an assertion.
  it('builds the same shape by hand otherwise: a registration and an assertion', () => {
    const reg = {
      id: 'Kis', rawId: buf(42, 43), type: 'public-key',
      response: { clientDataJSON: buf(1), attestationObject: buf(2, 3), getTransports: () => ['internal'] },
      getClientExtensionResults: () => ({ credProps: { rk: true } }),
    } as unknown as PublicKeyCredential
    expect(credentialJson(reg)).toEqual({
      id: 'Kis', rawId: 'Kis', type: 'public-key',
      response: { clientDataJSON: 'AQ', attestationObject: 'AgM', transports: ['internal'] },
      clientExtensionResults: { credProps: { rk: true } }, extensions: { credProps: { rk: true } },
    })
    const assertion = {
      id: 'Kis', rawId: buf(42, 43), type: 'public-key',
      response: { clientDataJSON: buf(1), authenticatorData: buf(4), signature: buf(5), userHandle: buf(6) },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential
    expect(credentialJson(assertion).response).toEqual({ clientDataJSON: 'AQ', authenticatorData: 'BA', signature: 'BQ', userHandle: 'Bg' })
  })

  // Runs the ceremonies through the credentials container it is given.
  it('runs the ceremonies through the credentials container it is given', async () => {
    const made = { toJSON: () => ({ id: 'new' }) }
    const creds = { create: vi.fn(async () => made as unknown as Credential), get: vi.fn(async () => null) }
    expect(await createPasskey(REG, creds)).toEqual({ id: 'new' })
    expect(creds.create.mock.calls[0]![0].publicKey).toBeDefined()
    await expect(getPasskey({ publicKey: { challenge: 'AQI' } }, creds)).rejects.toThrow(/No passkey/)
  })
})
