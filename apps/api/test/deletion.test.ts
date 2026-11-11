import { describe, it, expect, beforeEach } from 'bun:test';
import { createHarness, type Harness } from './helpers/harness';
import { rawSqlite } from './helpers/d1';

describe('Account and data deletion (store requirement)', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
  });

  const count = (table: string) => (rawSqlite(h.db).query(`SELECT COUNT(*) AS n FROM ${table}`).get() as any).n as number;

  it('a caregiver can delete their account with their password; everything of theirs is erased', async () => {
    const { cg, dev, relationshipId } = await h.connect();
    const plan = await h.call('GET', `/relationships/${relationshipId}/medications`, { auth: cg.auth });
    await h.call('POST', `/relationships/${relationshipId}/plan-commands`, {
      auth: cg.auth, headers: { 'Idempotency-Key': 'delete-test-0001' },
      body: { baseVersion: plan.json.latestPlanVersion, planSnapshot: h.snapshot() },
    });

    const wrong = await h.call('DELETE', '/auth/me', { auth: cg.auth, body: { password: 'not-the-password' } });
    expect(wrong.status).toBe(401);
    expect(count('caregiver_users')).toBe(1);

    const ok = await h.call('DELETE', '/auth/me', { auth: cg.auth, body: { password: 'correct-horse-battery' } });
    expect(ok.status).toBe(200);
    expect(count('caregiver_users')).toBe(0);
    expect(count('caregiver_credentials')).toBe(0);
    expect(count('refresh_tokens')).toBe(0);
    expect(count('relationships')).toBe(0);

    // The old access token is dead immediately, and the email can be registered again
    expect((await h.call('GET', '/auth/me', { auth: cg.auth })).status).toBe(401);
    expect((await h.call('GET', '/relationships', { auth: cg.auth })).status).toBe(401);
    expect((await h.call('POST', '/auth/register', { body: { email: cg.email, password: 'correct-horse-battery', displayName: 'Again' } })).status).toBe(201);

    // The patient's device still works and simply has no caregivers
    const rels = await h.call('GET', '/patient/relationships', { auth: dev.auth });
    expect(rels.status).toBe(200);
    expect(rels.json.items).toHaveLength(0);
  });

  it('deleting an account needs authentication', async () => {
    expect((await h.call('DELETE', '/auth/me', { body: { password: 'x' } })).status).toBe(401);
  });

  it('a patient can erase all server data for their phone; the caregiver loses access', async () => {
    const { cg, dev, relationshipId } = await h.connect();
    await h.call('POST', '/sync/dose-events', {
      auth: dev.auth,
      body: { events: [{ eventId: crypto.randomUUID(), occurrenceId: 'o1', medicationId: crypto.randomUUID(), eventType: 'DOSE_TAKEN', scheduledAt: '2026-11-09T10:00:00.000Z', actionTimestamp: '2026-11-09T10:01:00.000Z', timezoneId: 'Asia/Kolkata' }] },
    });
    expect(count('dose_events')).toBe(1);

    const res = await h.call('DELETE', '/devices/current?purge=true', { auth: dev.auth });
    expect(res.status).toBe(200);
    expect(res.json.purged).toBe(true);
    expect(count('patient_devices')).toBe(0);
    expect(count('dose_events')).toBe(0);
    expect(count('relationships')).toBe(0);

    expect((await h.call('GET', '/devices/current', { auth: dev.auth })).status).toBe(401);
    const gone = await h.call('GET', `/relationships/${relationshipId}/medications`, { auth: cg.auth });
    expect(gone.status).toBe(404);
    // The caregiver account itself is untouched
    expect((await h.call('GET', '/auth/me', { auth: cg.auth })).status).toBe(200);
  });
});

describe('Public store pages', () => {
  it('serves a privacy policy and deletion instructions without authentication', async () => {
    const h = createHarness();
    for (const path of ['/privacy', '/delete-account']) {
      const res = await h.app.request(path, {}, { ...h.env, SUPPORT_EMAIL: 'help@example.org' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const body = await res.text();
      expect(body).toContain('help@example.org');
      // The policy must state plainly that data is NOT end-to-end encrypted
      if (path === '/privacy') expect(body).toContain('<strong>not</strong> end-to-end encrypted');
    }
  });

  it('escapes operator-supplied values', async () => {
    const h = createHarness();
    const res = await h.app.request('/privacy', {}, { ...h.env, OPERATOR_NAME: '<script>alert(1)</script>' });
    expect(await res.text()).not.toContain('<script>alert(1)</script>');
  });
});
