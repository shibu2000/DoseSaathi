import { describe, expect, it } from 'bun:test';
import { FcmPushDispatcher, createPushDispatcher } from '../src/services/push/fcm';
import { NoopPushDispatcher } from '../src/services/push/dispatcher';
import { base64UrlToBytes, bytesToBase64Url } from '../src/lib/crypto';

async function makeServiceAccount() {
  const kp = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  let b64 = btoa(String.fromCharCode(...der));
  b64 = b64.match(/.{1,64}/g)!.join('\n');
  return { kp, sa: { project_id: 'proj-1', client_email: `svc-${crypto.randomUUID()}@proj-1.iam.gserviceaccount.com`, private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` } };
}

describe('FCM HTTP v1 dispatcher', () => {
  it('mints an RS256 service-account JWT, caches the OAuth token, sends data-only high priority messages', async () => {
    const { kp, sa } = await makeServiceAccount();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    let oauthCalls = 0;
    const fakeFetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init! });
      if (url.includes('oauth2')) {
        oauthCalls++;
        return new Response(JSON.stringify({ access_token: `at-${oauthCalls}`, expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ name: 'projects/proj-1/messages/1' }), { status: 200 });
    };
    let now = 1_800_000_000_000;
    const d = new FcmPushDispatcher(sa, fakeFetch, () => now, new Map());
    const msg = { token: 'device-token', data: { type: 'PLAN_VERSION', relationshipId: 'r1', version: '3' } };
    expect(await d.send(msg)).toEqual({ ok: true });
    expect(await d.send(msg)).toEqual({ ok: true });
    expect(oauthCalls).toBe(1); // cached

    // verify the assertion is a valid RS256 JWT for the right scope/audience
    const oauth = calls.find((c) => c.url.includes('oauth2'))!;
    const assertion = new URLSearchParams(oauth.init.body as string).get('assertion')!;
    const [h, c, s] = assertion.split('.') as [string, string, string];
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(c)));
    expect(claims).toMatchObject({ iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    expect(JSON.parse(new TextDecoder().decode(base64UrlToBytes(h))).alg).toBe('RS256');
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, base64UrlToBytes(s), new TextEncoder().encode(`${h}.${c}`))).toBe(true);

    const send = calls.find((c) => c.url.includes('messages:send'))!;
    expect(send.url).toBe('https://fcm.googleapis.com/v1/projects/proj-1/messages:send');
    expect((send.init.headers as Record<string, string>).Authorization).toBe('Bearer at-1');
    const body = JSON.parse(send.init.body as string).message;
    expect(body.token).toBe('device-token');
    expect(body.data).toEqual(msg.data);
    expect(body.notification).toBeUndefined();
    expect(body.android.priority).toBe('HIGH');

    now += 3600_000; // token expired -> refresh
    await d.send(msg);
    expect(oauthCalls).toBe(2);
  });

  it('maps failures: UNREGISTERED => tokenInvalid; 5xx/429 => retryable; 400 => permanent; 401 refreshes once', async () => {
    const { sa } = await makeServiceAccount();
    let status = 200;
    let body: unknown = {};
    let sendCalls = 0;
    const f = async (url: string) => {
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'x', expires_in: 3600 }), { status: 200 });
      sendCalls++;
      return new Response(JSON.stringify(body), { status });
    };
    const d = new FcmPushDispatcher(sa, f, Date.now, new Map());
    const m = { token: 't', data: { type: 'X' } };
    status = 404; body = { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } };
    expect(await d.send(m)).toMatchObject({ ok: false, retryable: false, tokenInvalid: true });
    status = 503; body = {};
    expect(await d.send(m)).toMatchObject({ ok: false, retryable: true });
    status = 429;
    expect(await d.send(m)).toMatchObject({ ok: false, retryable: true });
    status = 400; body = { error: { status: 'INVALID_ARGUMENT' } };
    expect(await d.send(m)).toMatchObject({ ok: false, retryable: false });
    status = 401; sendCalls = 0;
    expect(await d.send(m)).toMatchObject({ ok: false, retryable: true });
    expect(sendCalls).toBe(2);
  });

  it('network and oauth failures are retryable; no secret configured => no-op dispatcher', async () => {
    const { sa } = await makeServiceAccount();
    const d = new FcmPushDispatcher(sa, async () => { throw new Error('offline'); }, Date.now, new Map());
    expect(await d.send({ token: 't', data: {} })).toMatchObject({ ok: false, retryable: true });
    expect(createPushDispatcher({})).toBeInstanceOf(NoopPushDispatcher);
    expect(createPushDispatcher({ FCM_SERVICE_ACCOUNT_JSON: '{bad' })).toBeInstanceOf(NoopPushDispatcher);
    expect(createPushDispatcher({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(sa) })).toBeInstanceOf(FcmPushDispatcher);
    expect(bytesToBase64Url(new Uint8Array([251, 255]))).toBe('-_8');
  });
});
