import { describe, expect, it } from 'bun:test';
import { createHarness, uuid } from './helpers/harness';

const sql = (h: ReturnType<typeof createHarness>) => (h.db as any).sqlite;

describe('pairing (requirements 14.3)', () => {
  it('valid code: caregiver validates, requests; patient sees REAL caregiver identity and scope', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver('Marta Hoffmann', 'marta@example.com');
    const dev = await h.registerDevice('Rosa Klein');
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    expect(s.status).toBe(201);
    expect(s.json.pairingCode).toMatch(/^\d{6}$/);
    expect(s.json.expiresInSeconds).toBe(600);
    expect(new Date(s.json.expiresAt).getTime() - h.clock.t).toBe(600_000);
    expect(s.json.qrPayload).toBe(`dosesaathi://pair?session=${s.json.sessionId}&secret=${s.json.qrPayload.split('secret=')[1]}`);

    const v = await h.call('POST', '/pairing/validate', { auth: cg.auth, body: { code: s.json.pairingCode } });
    expect(v.json).toMatchObject({ valid: true, sessionId: s.json.sessionId, patientDisplayName: 'Rosa Klein' });

    const req = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS'] } });
    expect(req.status).toBe(201);
    expect(req.json.status).toBe('PENDING');

    const view = await h.call('GET', `/pairing/sessions/${s.json.sessionId}`, { auth: dev.auth });
    expect(view.json.status).toBe('CONSUMED');
    expect(view.json.incomingRequest).toMatchObject({
      requestId: req.json.requestId, caregiverDisplayName: 'Marta Hoffmann', caregiverEmail: 'marta@example.com',
      requestedPermissions: ['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS'], status: 'PENDING',
    });
    const st = await h.call('GET', `/pairing/requests/${req.json.requestId}/status`, { auth: cg.auth });
    expect(st.json).toMatchObject({ status: 'PENDING', relationshipId: null, relationship: null });
    await h.flush();
    expect(h.push.sent.at(-1)!.data).toEqual({ type: 'PAIRING_REQUEST', sessionId: s.json.sessionId });
  });

  it('stores only hashes: no raw code or secret in the database', async () => {
    const h = createHarness();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const dump = JSON.stringify(sql(h).query('SELECT * FROM pairing_sessions').all());
    expect(dump).not.toContain(s.json.pairingCode);
    expect(dump).not.toContain(s.json.qrPayload.split('secret=')[1]);
    expect(sql(h).query("SELECT name FROM pragma_table_info('pairing_sessions')").all().map((r: any) => r.name)).not.toContain('raw_code_dev');
  });

  it('QR payload (sessionId + secret) works; wrong secret fails and eventually kills the session', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const secret = s.json.qrPayload.split('secret=')[1];
    const bad = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { sessionId: s.json.sessionId, secret: 'x'.repeat(43), requestedPermissions: ['VIEW_SCHEDULE'] } });
    expect(bad.status).toBe(404);
    expect(bad.json.error.code).toBe('PAIRING_CODE_INVALID');
    expect(sql(h).query('SELECT failed_attempts FROM pairing_sessions').get().failed_attempts).toBe(1);
    const ok = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { sessionId: s.json.sessionId, secret, requestedPermissions: ['VIEW_SCHEDULE'] } });
    expect(ok.status).toBe(201);
  });

  it('path variant /pairing/sessions/:id/requests accepts {code} and {secret}; mismatched session is rejected', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const wrong = await h.call('POST', `/pairing/sessions/${uuid()}/requests`, { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    expect(wrong.status).toBe(404);
    const ok = await h.call('POST', `/pairing/sessions/${s.json.sessionId}/requests`, { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    expect(ok.status).toBe(201);
  });

  it('invalid, expired, consumed and regenerated codes all return the same 404', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const body = (code: string) => ({ code, requestedPermissions: ['VIEW_SCHEDULE'] });
    const attempt = (code: string) => h.call('POST', '/pairing/requests', { auth: cg.auth, body: body(code) });

    const a = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const invalid = await attempt(a.json.pairingCode === '000000' ? '000001' : '000000');
    expect(invalid.status).toBe(404);

    // regenerated: old code is dead, new works
    const b = await h.call('POST', `/pairing/sessions/${a.json.sessionId}/regenerate`, { auth: dev.auth });
    expect(b.status).toBe(201);
    expect(b.json.sessionId).not.toBe(a.json.sessionId);
    const regen = await attempt(a.json.pairingCode);
    expect(regen.status).toBe(404);
    expect(regen.json.error).toMatchObject({ code: 'PAIRING_CODE_INVALID', message: invalid.json.error.message });

    // consumed
    expect((await attempt(b.json.pairingCode)).status).toBe(201);
    const cg2 = await h.registerCaregiver();
    const consumed = await h.call('POST', '/pairing/requests', { auth: cg2.auth, body: body(b.json.pairingCode) });
    expect(consumed.status).toBe(404);

    // expired
    const c = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    h.clock.t += 10 * 60 * 1000;
    const expired = await h.call('POST', '/pairing/requests', { auth: cg2.auth, body: body(c.json.pairingCode) });
    expect(expired.status).toBe(404);
    expect(expired.json.error.code).toBe('PAIRING_CODE_INVALID');
  });

  it('regenerate cancels the pending request of the old session', async () => {
    const h = createHarness();
    const { dev, cg, sessionId } = await (async () => {
      const cg = await h.registerCaregiver();
      const dev = await h.registerDevice();
      const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
      const r = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
      return { dev, cg, sessionId: s.json.sessionId, requestId: r.json.requestId, ...r.json };
    })();
    const reqId = sql(h).query('SELECT id FROM connection_requests').get().id;
    await h.call('POST', `/pairing/sessions/${sessionId}/regenerate`, { auth: dev.auth });
    const st = await h.call('GET', `/pairing/requests/${reqId}/status`, { auth: cg.auth });
    expect(st.json.status).toBe('CANCELLED');
    const ap = await h.call('POST', `/pairing/requests/${reqId}/approve`, { auth: dev.auth, body: { approvedPermissions: ['VIEW_SCHEDULE'], relationshipLabel: 'X' } });
    expect(ap.status).toBe(409);
  });

  it('brute force: wrong codes hit 429 with Retry-After, and a correct code is then also blocked', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const wrong = s.json.pairingCode === '123456' ? '654321' : '123456';
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await h.call('POST', '/pairing/validate', { auth: cg.auth, body: { code: wrong }, ip: '1.1.1.1' })).status);
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses[5]).toBe(429);
    const blocked = await h.call('POST', '/pairing/validate', { auth: cg.auth, body: { code: s.json.pairingCode }, ip: '1.1.1.1' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    h.clock.t += 16 * 60 * 1000;
    const later = await h.call('POST', '/pairing/validate', { auth: cg.auth, body: { code: s.json.pairingCode } });
    expect(later.status).toBe(404); // session itself expired by now, but not rate limited
  });

  it('per-IP limit applies across caregivers; session creation is rate limited per device', async () => {
    const h = createHarness();
    for (let i = 0; i < 30; i++) {
      const cg = await h.registerCaregiver();
      await h.call('POST', '/pairing/validate', { auth: cg.auth, body: { code: '111111' }, ip: '9.9.9.9' });
    }
    const cg = await h.registerCaregiver();
    expect((await h.call('POST', '/pairing/validate', { auth: cg.auth, body: { code: '111111' }, ip: '9.9.9.9' })).status).toBe(429);
    const dev = await h.registerDevice();
    for (let i = 0; i < 5; i++) expect((await h.call('POST', '/pairing/sessions', { auth: dev.auth })).status).toBe(201);
    expect((await h.call('POST', '/pairing/sessions', { auth: dev.auth })).status).toBe(429);
  });

  it('unauthenticated caregiver cannot create a request; spoofed legacy tokens fail', async () => {
    const h = createHarness();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const body = { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] };
    expect((await h.call('POST', '/pairing/requests', { body })).status).toBe(401);
    expect((await h.call('POST', '/pairing/requests', { auth: 'Bearer cg_arthur_123', body })).status).toBe(401);
    expect((await h.call('POST', '/pairing/requests', { auth: dev.auth, body })).status).toBe(401); // device cred is not a caregiver
    expect(sql(h).query('SELECT COUNT(*) n FROM connection_requests').get().n).toBe(0);
  });

  it('session creation requires a device display name (never hardcoded)', async () => {
    const h = createHarness();
    const reg = await h.call('POST', '/devices/register', { body: { platform: 'ios', appVersion: '1.0.0' } });
    const s = await h.call('POST', '/pairing/sessions', { auth: `Device ${reg.json.deviceId}.${reg.json.deviceSecret}` });
    expect(s.status).toBe(422);
    expect(s.json.error.code).toBe('DISPLAY_NAME_REQUIRED');
  });

  it('decline creates no relationship; replay idempotent; approve after decline conflicts', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const r = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    const d1 = await h.call('POST', `/pairing/requests/${r.json.requestId}/decline`, { auth: dev.auth });
    const d2 = await h.call('POST', `/pairing/requests/${r.json.requestId}/decline`, { auth: dev.auth });
    expect([d1.status, d2.status, d1.json.status]).toEqual([200, 200, 'DECLINED']);
    expect(sql(h).query('SELECT COUNT(*) n FROM relationships').get().n).toBe(0);
    const ap = await h.call('POST', `/pairing/requests/${r.json.requestId}/approve`, { auth: dev.auth, body: { approvedPermissions: ['VIEW_SCHEDULE'], relationshipLabel: 'Son' } });
    expect(ap.status).toBe(409);
    const st = await h.call('GET', `/pairing/requests/${r.json.requestId}/status`, { auth: cg.auth });
    expect(st.json.status).toBe('DECLINED');
    expect((await h.call('GET', '/relationships', { auth: cg.auth })).json.items).toEqual([]);
  });

  it('approve creates exactly one relationship with exactly the approved subset; replay is idempotent', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice('Rosa');
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const r = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS'] } });
    const approve = () => h.call('POST', `/pairing/requests/${r.json.requestId}/approve`, { auth: dev.auth, body: { approvedPermissions: ['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS'], relationshipLabel: 'Daughter' } });
    const a1 = await approve();
    const a2 = await approve();
    expect(a1.status).toBe(200);
    expect(a2.json.relationshipId).toBe(a1.json.relationshipId);
    expect(a1.json.permissions).toEqual(['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS']);
    expect(sql(h).query('SELECT COUNT(*) n FROM relationships').get().n).toBe(1);
    const st = await h.call('GET', `/pairing/requests/${r.json.requestId}/status`, { auth: cg.auth });
    expect(st.json.status).toBe('APPROVED');
    expect(st.json.relationship).toMatchObject({ relationshipId: a1.json.relationshipId, patientDisplayName: 'Rosa', relationshipLabel: 'Daughter', status: 'ACTIVE', permissions: ['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS'] });
  });

  it('cannot approve more than requested, or approve with an EDIT-without-VIEW set', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const r = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    const more = await h.call('POST', `/pairing/requests/${r.json.requestId}/approve`, { auth: dev.auth, body: { approvedPermissions: ['VIEW_SCHEDULE', 'EDIT_SCHEDULE'], relationshipLabel: 'A' } });
    expect(more.status).toBe(400);
    const edit = await h.call('POST', `/pairing/requests/${r.json.requestId}/approve`, { auth: dev.auth, body: { approvedPermissions: ['EDIT_SCHEDULE'], relationshipLabel: 'A' } });
    expect(edit.status).toBe(400);
    expect(sql(h).query('SELECT COUNT(*) n FROM relationships').get().n).toBe(0);
  });

  it('fabricated caregiver_id / permissions / confirmedAt / relationship_id in bodies are ignored', async () => {
    const h = createHarness();
    const victim = await h.registerCaregiver('Victim');
    const attacker = await h.registerCaregiver('Attacker');
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const r = await h.call('POST', '/pairing/requests', {
      auth: attacker.auth,
      body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'], caregiverId: victim.caregiver.id, caregiver_id: victim.caregiver.id, permissions: ['EDIT_SCHEDULE'], relationshipId: uuid() },
    });
    expect(r.status).toBe(201);
    const ap = await h.call('POST', `/pairing/requests/${r.json.requestId}/approve`, {
      auth: dev.auth, body: { approvedPermissions: ['VIEW_SCHEDULE'], relationshipLabel: 'X', caregiverId: victim.caregiver.id, confirmedAt: '2000-01-01T00:00:00.000Z', relationshipId: uuid() },
    });
    const row = sql(h).query('SELECT * FROM relationships').get();
    expect(row.caregiver_user_id).toBe(attacker.caregiver.id);
    expect(row.id).toBe(ap.json.relationshipId);
    expect(row.confirmed_at).toBe(new Date(h.clock.t).toISOString());
    expect(JSON.parse(row.permissions_json)).toEqual(['VIEW_SCHEDULE']);
    expect((await h.call('GET', '/relationships', { auth: victim.auth })).json.items).toEqual([]);
  });

  it('a different device cannot read/approve/decline another device\'s session or request; caregivers cannot poll others\' requests', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const other = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const evil = await h.registerDevice('Evil');
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const r = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    expect((await h.call('GET', `/pairing/sessions/${s.json.sessionId}`, { auth: evil.auth })).status).toBe(404);
    expect((await h.call('POST', `/pairing/sessions/${s.json.sessionId}/regenerate`, { auth: evil.auth })).status).toBe(404);
    expect((await h.call('POST', `/pairing/requests/${r.json.requestId}/approve`, { auth: evil.auth, body: { approvedPermissions: ['VIEW_SCHEDULE'], relationshipLabel: 'x' } })).status).toBe(404);
    expect((await h.call('POST', `/pairing/requests/${r.json.requestId}/decline`, { auth: evil.auth })).status).toBe(404);
    expect((await h.call('GET', `/pairing/requests/${r.json.requestId}/status`, { auth: other.auth })).status).toBe(404);
  });

  it('approval after the session expired returns 410 and creates nothing', async () => {
    const h = createHarness();
    const cg = await h.registerCaregiver();
    const dev = await h.registerDevice();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const r = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    h.clock.t += 11 * 60 * 1000;
    const st = await h.call('GET', `/pairing/requests/${r.json.requestId}/status`, { auth: cg.auth });
    expect(st.json.status).toBe('EXPIRED');
    const ap = await h.call('POST', `/pairing/requests/${r.json.requestId}/approve`, { auth: dev.auth, body: { approvedPermissions: ['VIEW_SCHEDULE'], relationshipLabel: 'x' } });
    expect(ap.status).toBe(410);
    expect(sql(h).query('SELECT COUNT(*) n FROM relationships').get().n).toBe(0);
  });

  it('caregiver can cancel a pending request; duplicate active connection is rejected', async () => {
    const h = createHarness();
    const { cg, dev } = await h.connect();
    const s = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const dupe = await h.call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    expect(dupe.status).toBe(409);
    expect(dupe.json.error.code).toBe('ALREADY_CONNECTED');
    const cg2 = await h.registerCaregiver();
    const s2 = await h.call('POST', '/pairing/sessions', { auth: dev.auth });
    const r = await h.call('POST', '/pairing/requests', { auth: cg2.auth, body: { code: s2.json.pairingCode, requestedPermissions: ['VIEW_SCHEDULE'] } });
    const c1 = await h.call('DELETE', `/pairing/requests/${r.json.requestId}`, { auth: cg2.auth });
    expect(c1.json.status).toBe('CANCELLED');
    expect((await h.call('DELETE', `/pairing/requests/${r.json.requestId}`, { auth: cg2.auth })).status).toBe(200);
  });

  it('code generation is uniform 6-digit including leading zeros', async () => {
    const { randomSixDigitCode, randomInt } = await import('../src/lib/crypto');
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = randomSixDigitCode();
      expect(c).toMatch(/^\d{6}$/);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(1900);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) counts[randomInt(10)]++;
    for (const n of counts) expect(Math.abs(n - 2000)).toBeLessThan(300);
  });
});
