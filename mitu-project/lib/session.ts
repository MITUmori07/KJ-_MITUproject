// V1.0.0
const encoder = new TextEncoder()

function b64urlEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(input: string): Uint8Array {
  let s = input.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function createSession(secret: string, maxAgeSeconds: number): Promise<string> {
  const exp = Date.now() + maxAgeSeconds * 1000
  const payload = b64urlEncode(encoder.encode(JSON.stringify({ exp })))
  const key = await getKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return `${payload}.${b64urlEncode(sig)}`
}

export async function verifySession(secret: string, token: string | undefined): Promise<boolean> {
  if (!token || !secret) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, sig] = parts
  try {
    const key = await getKey(secret)
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), encoder.encode(payload))
    if (!ok) return false
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)))
    if (typeof data.exp !== 'number' || Date.now() > data.exp) return false
    return true
  } catch {
    return false
  }
}
