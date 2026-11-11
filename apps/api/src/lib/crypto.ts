// WebCrypto helpers (Workers + Bun compatible). No secrets are ever logged.
const enc = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}
export const randomToken = (bytes = 32): string => bytesToBase64Url(randomBytes(bytes));

/** Uniform random integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max: number): number {
  if (max <= 0 || max > 2 ** 32) throw new RangeError('max out of range');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % max;
  }
}
export const randomSixDigitCode = (): string => String(randomInt(1_000_000)).padStart(6, '0');

export async function sha256Hex(input: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(input))));
}

export async function hmacSha256Hex(key: string, input: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(input))));
}

/** Constant-time string comparison (length is not secret for our fixed-size digests). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// ---- passwords -------------------------------------------------------------
export const MAX_PBKDF2_ITERATIONS = 100_000; // Cloudflare Workers limit

export async function pbkdf2Hash(password: string, salt: BufferSource, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Math.min(iterations, MAX_PBKDF2_ITERATIONS) },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

// ---- JWT HS256 -------------------------------------------------------------
async function hmacKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export interface JwtClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
}

export async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  const head = bytesToBase64Url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = bytesToBase64Url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

/** Returns claims only if the HS256 signature, iss, aud and exp are valid. */
export async function verifyJwt(
  token: string,
  secret: string,
  expect: { iss: string; aud: string; nowSeconds: number },
): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(h)));
    if (header.alg !== 'HS256') return null;
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, 'verify'),
      base64UrlToBytes(s),
      enc.encode(`${h}.${b}`),
    );
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(base64UrlToBytes(b))) as JwtClaims;
    if (c.iss !== expect.iss || c.aud !== expect.aud) return null;
    if (typeof c.exp !== 'number' || c.exp <= expect.nowSeconds) return null;
    if (typeof c.sub !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}
