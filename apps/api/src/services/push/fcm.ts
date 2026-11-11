import { bytesToBase64Url, base64UrlToBytes } from '../../lib/crypto';
import { NoopPushDispatcher, type PushDispatcher, type PushMessage, type PushResult } from './dispatcher';
import { log } from '../../lib/logger';

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
interface CachedToken {
  token: string;
  expiresAtMs: number;
}
// Module-level so the token survives across requests in one isolate.
const sharedTokenCache = new Map<string, CachedToken>();

const enc = new TextEncoder();
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class FcmPushDispatcher implements PushDispatcher {
  readonly enabled = true;
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(
    private sa: ServiceAccount,
    private fetchImpl: FetchLike = (i, init) => fetch(i, init),
    private nowMs: () => number = Date.now,
    private cache: Map<string, CachedToken> = sharedTokenCache,
  ) {}

  private importKey(): Promise<CryptoKey> {
    this.keyPromise ??= (async () => {
      const b64 = this.sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
      const der = base64UrlToBytes(b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
      return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    })();
    return this.keyPromise;
  }

  private async signAssertion(): Promise<string> {
    const iat = Math.floor(this.nowMs() / 1000);
    const head = bytesToBase64Url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claims = bytesToBase64Url(
      enc.encode(JSON.stringify({ iss: this.sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 })),
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await this.importKey(), enc.encode(`${head}.${claims}`));
    return `${head}.${claims}.${bytesToBase64Url(new Uint8Array(sig))}`;
  }

  private async accessToken(forceRefresh = false): Promise<string> {
    const cached = this.cache.get(this.sa.client_email);
    if (!forceRefresh && cached && cached.expiresAtMs - 60_000 > this.nowMs()) return cached.token;
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await this.signAssertion(),
      }).toString(),
    });
    if (!res.ok) throw new Error(`oauth_${res.status}`);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error('oauth_no_token');
    this.cache.set(this.sa.client_email, {
      token: json.access_token,
      expiresAtMs: this.nowMs() + (json.expires_in ?? 3600) * 1000,
    });
    return json.access_token;
  }

  async send(message: PushMessage, retriedAuth = false): Promise<PushResult> {
    let token: string;
    try {
      token = await this.accessToken(retriedAuth);
    } catch (e) {
      log('warn', 'fcm_auth_failed', { errorCode: (e as Error).message });
      return { ok: false, retryable: true, code: 'FCM_AUTH' };
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.sa.project_id)}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: message.token,
            data: message.data, // data-only: no `notification` block
            android: { priority: 'HIGH', ttl: '86400s' },
            apns: {
              headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
              payload: { aps: { 'content-available': 1 } },
            },
          },
        }),
      });
    } catch {
      return { ok: false, retryable: true, code: 'FCM_NETWORK' };
    }
    if (res.ok) return { ok: true };
    let status = '';
    try {
      const body = (await res.json()) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } };
      status = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status ?? '';
    } catch {
      /* ignore body parse errors */
    }
    if (res.status === 404 || status === 'UNREGISTERED') return { ok: false, retryable: false, tokenInvalid: true, code: 'FCM_UNREGISTERED' };
    if (res.status === 401 && !retriedAuth) {
      this.cache.delete(this.sa.client_email);
      return this.send(message, true);
    }
    if (res.status === 429 || res.status >= 500 || res.status === 401) return { ok: false, retryable: true, code: `FCM_${res.status}` };
    return { ok: false, retryable: false, code: `FCM_${res.status}${status ? '_' + status : ''}` };
  }
}

export function createPushDispatcher(env: { FCM_SERVICE_ACCOUNT_JSON?: string }, fetchImpl?: FetchLike): PushDispatcher {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) return new NoopPushDispatcher();
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('incomplete');
    return new FcmPushDispatcher(sa, fetchImpl);
  } catch {
    log('error', 'fcm_config_invalid');
    return new NoopPushDispatcher();
  }
}
