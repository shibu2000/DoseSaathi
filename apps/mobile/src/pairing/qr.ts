export interface PairingQrCredential {
  sessionId: string;
  secret: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Strict parser for `dosesaathi://pair?session=<uuid>&secret=<token>`.
 * Returns null for anything else. A successful parse is NOT proof of anything:
 * the server must still validate the credential.
 */
export function parsePairingPayload(raw: string | null | undefined): PairingQrCredential | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > 512) return null;
  const prefix = 'dosesaathi://pair?';
  if (!text.startsWith(prefix)) return null;
  const query = text.slice(prefix.length);
  if (query.includes('#')) return null;
  const params = new Map<string, string>();
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) return null;
    const key = part.slice(0, eq);
    let value: string;
    try {
      value = decodeURIComponent(part.slice(eq + 1));
    } catch {
      return null;
    }
    if (params.has(key)) return null; // duplicate keys are ambiguous
    params.set(key, value);
  }
  if (params.size !== 2) return null;
  const sessionId = params.get('session');
  const secret = params.get('secret');
  if (!sessionId || !secret) return null;
  if (!UUID_RE.test(sessionId) || !SECRET_RE.test(secret)) return null;
  return { sessionId, secret };
}
