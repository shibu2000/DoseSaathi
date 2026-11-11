import { describe, expect, it } from 'bun:test';
import { createHarness } from './helpers/harness';

describe('caregiver auth', () => {
  it('registers, logs in, returns me, and hashes the password with PBKDF2', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver('Ann', 'ann@example.com');
    const me = await h.call('GET', '/auth/me', { auth: cg.auth });
    expect(me.status).toBe(200);
    expect(me.json.caregiver).toEqual({ id: cg.caregiver.id, email: 'ann@example.com', displayName: 'Ann' });
    const cred = (h.db as any).sqlite.query('SELECT * FROM caregiver_credentials').get();
    expect(cred.password_hash).not.toContain('correct-horse');
    expect(cred.salt.length).toBeGreaterThan(10);
    const login = await h.call('POST', '/auth/login', { body: { email: 'ANN@example.com', password: 'correct-horse-battery' } });
    expect(login.status).toBe(200);
    expect(login.json.accessToken).toBeTruthy();
  });

  it('rejects wrong password, duplicate email, weak password; never reveals which part failed', async () => {
    const h = createHarness();
    await h.registerCaregiver('Ann', 'ann@example.com');
    const bad = await h.call('POST', '/auth/login', { body: { email: 'ann@example.com', password: 'nope-nope-nope' } });
    expect(bad.status).toBe(401);
    expect(bad.json.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await h.call('POST', '/auth/login', { body: { email: 'x@example.com', password: 'nope-nope-nope' } });
    expect(unknown.json.error.message).toBe(bad.json.error.message);
    const dup = await h.call('POST', '/auth/register', { body: { email: 'ann@example.com', password: 'another-long-pass', displayName: 'B' } });
    expect(dup.status).toBe(409);
    const weak = await h.call('POST', '/auth/register', { body: { email: 'w@example.com', password: 'short', displayName: 'W' } });
    expect(weak.status).toBe(400);
    expect(weak.json.error.code).toBe('VALIDATION_ERROR');
    expect(weak.json.error.fieldErrors[0].field).toBe('body.password');
  });

  it('rate-limits repeated failed logins with Retry-After', async () => {
    const h = createHarness();
    await h.registerCaregiver('Ann', 'ann@example.com');
    let last: any;
    for (let i = 0; i < 11; i++) last = await h.call('POST', '/auth/login', { body: { email: 'ann@example.com', password: 'wrong-wrong-wrong' } });
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(last.json.error.code).toBe('RATE_LIMITED');
  });

  it('rotates refresh tokens, detects reuse, and logout revokes the family', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const r1 = await h.call('POST', '/auth/refresh', { body: { refreshToken: cg.refreshToken } });
    expect(r1.status).toBe(200);
    expect(r1.json.refreshToken).not.toBe(cg.refreshToken);
    const reuse = await h.call('POST', '/auth/refresh', { body: { refreshToken: cg.refreshToken } });
    expect(reuse.status).toBe(401);
    const afterReuse = await h.call('POST', '/auth/refresh', { body: { refreshToken: r1.json.refreshToken } });
    expect(afterReuse.status).toBe(401); // family revoked

    const cg2 = await h.registerCaregiver();
    expect((await h.call('POST', '/auth/logout', { body: { refreshToken: cg2.refreshToken } })).status).toBe(200);
    expect((await h.call('POST', '/auth/refresh', { body: { refreshToken: cg2.refreshToken } })).status).toBe(401);
  });

  it('rejects missing, forged and expired access tokens', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    expect((await h.call('GET', '/auth/me')).status).toBe(401);
    expect((await h.call('GET', '/auth/me', { auth: 'Bearer cg_arthur_123' })).status).toBe(401);
    const [a, b, c] = cg.accessToken.split('.');
    expect((await h.call('GET', '/auth/me', { auth: `Bearer ${a}.${b}.${c!.slice(0, -2)}xx` })).status).toBe(401);
    h.clock.t += 31 * 60 * 1000;
    const exp = await h.call('GET', '/auth/me', { auth: cg.auth });
    expect(exp.status).toBe(401);
  });
});

describe('device identity', () => {
  it('registers once, stores only a hash, and re-register only updates token/version', async () => {
    const h = createHarness();
    const d = await h.registerDevice('Pat', 'tok-a');
    const row = (h.db as any).sqlite.query('SELECT * FROM patient_devices WHERE id = ?').get(d.id);
    expect(row.secret_hash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain(d.secret);
    const re = await h.call('POST', '/devices/register', { auth: d.auth, body: { platform: 'ios', appVersion: '2.0.0', pushToken: 'tok-b' } });
    expect(re.status).toBe(200);
    expect(re.json.deviceId).toBe(d.id);
    expect(re.json.deviceSecret).toBeUndefined();
    const prof = await h.call('GET', '/devices/current', { auth: d.auth });
    expect(prof.json.appVersion).toBe('2.0.0');
    expect(prof.json.platform).toBe('android'); // unchanged
    expect(prof.json.displayName).toBe('Pat');
  });

  it('rejects bad secrets and legacy X-Device-Id; invalid header on register never mints identity', async () => {
    const h = createHarness();
    const d = await h.registerDevice();
    expect((await h.call('GET', '/devices/current', { auth: `Device ${d.id}.${'a'.repeat(43)}` })).status).toBe(401);
    expect((await h.call('GET', '/devices/current', { headers: { 'X-Device-Id': d.id } })).status).toBe(401);
    const before = (h.db as any).sqlite.query('SELECT COUNT(*) n FROM patient_devices').get().n;
    const r = await h.call('POST', '/devices/register', { auth: `Device ${d.id}.${'a'.repeat(43)}`, body: { platform: 'ios', appVersion: '1' } });
    expect(r.status).toBe(401);
    expect((h.db as any).sqlite.query('SELECT COUNT(*) n FROM patient_devices').get().n).toBe(before);
  });

  it('PATCH display name and unregister revokes relationships', async () => {
    const h = createHarness();
    const { dev, cg, relationshipId } = await h.connect();
    const p = await h.call('PATCH', '/devices/current', { auth: dev.auth, body: { displayName: 'Eleanor' } });
    expect(p.json.displayName).toBe('Eleanor');
    const list = await h.call('GET', '/relationships', { auth: cg.auth });
    expect(list.json.items[0].patientDisplayName).toBe('Eleanor');
    expect((await h.call('DELETE', '/devices/current', { auth: dev.auth })).status).toBe(200);
    expect((await h.call('GET', '/devices/current', { auth: dev.auth })).status).toBe(401);
    expect((await h.call('GET', `/relationships/${relationshipId}`, { auth: cg.auth })).status).toBe(403);
  });
});

describe('platform hardening', () => {
  it('health includes db check; errors use the envelope; no stack leaks; security headers set', async () => {
    const h = createHarness();
    const r = await h.call('GET', '/health');
    expect(r.json.checks.db).toBe('ok');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const nf = await h.call('GET', '/nope');
    expect(nf.status).toBe(404);
    expect(nf.json.error.requestId).toBeTruthy();
    const bad = await h.app.request('/api/v1/auth/login', { method: 'POST', body: '{not json', headers: { 'Content-Type': 'application/json' } }, h.env);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.code).toBe('INVALID_JSON');
  });
  it('rejects oversized bodies with 413', async () => {
    const h = createHarness();
    const big = await h.call('POST', '/auth/login', { body: { email: 'a@b.co', password: 'x'.repeat(70_000) } });
    expect(big.status).toBe(413);
  });
  it('no CORS headers unless origin allowlisted', async () => {
    const h = createHarness();
    const none = await h.app.request('/api/v1/health', { headers: { Origin: 'https://evil.example' } }, h.env);
    expect(none.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const ok = await h.app.request('/api/v1/health', { headers: { Origin: 'https://app.example' } }, { ...h.env, ALLOWED_ORIGINS: 'https://app.example' });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
  });
});
