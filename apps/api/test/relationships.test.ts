import { describe, expect, it } from 'bun:test';
import { createHarness, uuid } from './helpers/harness';

const sql = (h: ReturnType<typeof createHarness>) => (h.db as any).sqlite;

describe('relationships and authorization (14.3)', () => {
  it('lists with real patient name, permissions and device status fields', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect({ permissions: ['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS'] });
    const list = await h.call('GET', '/relationships', { auth: cg.auth });
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0]).toMatchObject({
      relationshipId, patientDisplayName: 'Pat Patient', relationshipLabel: 'Daughter', permissions: ['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS'],
      status: 'ACTIVE', latestPlanVersion: 0, lastAppliedVersion: 0, lastSyncedAt: null,
    });
    expect(list.json.items[0].deviceLastSeenAt).toBeTruthy();
    h.clock.t += 120_000;
    await h.call('GET', '/devices/current/changes', { auth: dev.auth });
    const again = await h.call('GET', `/relationships/${relationshipId}`, { auth: cg.auth });
    expect(again.json.relationship.lastSyncedAt).toBe(new Date(h.clock.t).toISOString());
    expect(again.json.relationship.deviceLastSeenAt).toBe(new Date(h.clock.t).toISOString());
  });

  it('IDOR: another caregiver (and unknown ids) get 404 on every relationship route; no data leaks', async () => {
    const h = createHarness();
    const a = await h.connect();
    const intruder = await h.registerCaregiver('Intruder');
    const id = a.relationshipId;
    const cmdId = uuid();
    const routes: Array<[string, string, unknown?]> = [
      ['GET', `/relationships/${id}`],
      ['DELETE', `/relationships/${id}`],
      ['GET', `/relationships/${id}/medications`],
      ['GET', `/relationships/${id}/medications/${uuid()}`],
      ['POST', `/relationships/${id}/medications`, { baseVersion: 0, medication: h.med() }],
      ['PATCH', `/relationships/${id}/medications/${uuid()}`, { baseVersion: 0, medication: { name: 'x' } }],
      ['DELETE', `/relationships/${id}/medications/${uuid()}?baseVersion=0`],
      ['POST', `/relationships/${id}/plan-commands`, { baseVersion: 0, planSnapshot: h.snapshot() }],
      ['GET', `/relationships/${id}/plan-commands/${cmdId}`],
      ['GET', `/relationships/${id}/activity`],
    ];
    for (const [m, p, body] of routes) {
      const r = await h.call(m, p, { auth: intruder.auth, body, headers: { 'Idempotency-Key': 'idem-key-12345' } });
      expect([m + p, r.status]).toEqual([m + p, 404]);
    }
    expect((await h.call('GET', `/relationships/${uuid()}`, { auth: a.cg.auth })).status).toBe(404);
    expect((await h.call('GET', `/relationships/not-a-uuid`, { auth: a.cg.auth })).status).toBe(404);
    expect((await h.call('GET', '/relationships', { auth: intruder.auth })).json.items).toEqual([]);
    // still healthy for the owner
    expect((await h.call('GET', `/relationships/${id}`, { auth: a.cg.auth })).status).toBe(200);
  });

  it('another patient device cannot see or revoke someone else\'s relationship', async () => {
    const h = createHarness();
    const a = await h.connect();
    const other = await h.registerDevice('Other');
    expect((await h.call('GET', '/patient/relationships', { auth: other.auth })).json.items).toEqual([]);
    expect((await h.call('POST', `/patient/relationships/${a.relationshipId}/revoke`, { auth: other.auth })).status).toBe(404);
    expect((await h.call('PATCH', `/patient/relationships/${a.relationshipId}`, { auth: other.auth, body: { permissions: ['VIEW_SCHEDULE'] } })).status).toBe(404);
    expect((await h.call('GET', `/relationships/${a.relationshipId}`, { auth: a.cg.auth })).json.relationship.status).toBe('ACTIVE');
  });

  it('missing permission => 403 PERMISSION_DENIED per route', async () => {
    const h = createHarness();
    const { cg, relationshipId } = await h.connect({ permissions: ['VIEW_SCHEDULE'] });
    const edit = await h.call('POST', `/relationships/${relationshipId}/plan-commands`, { auth: cg.auth, body: { baseVersion: 0, planSnapshot: h.snapshot() }, headers: { 'Idempotency-Key': 'idem-key-12345' } });
    expect(edit.status).toBe(403);
    expect(edit.json.error.code).toBe('PERMISSION_DENIED');
    expect((await h.call('GET', `/relationships/${relationshipId}/activity`, { auth: cg.auth })).status).toBe(403);
    expect((await h.call('GET', `/relationships/${relationshipId}/medications`, { auth: cg.auth })).status).toBe(200);
  });

  it('patient revoke blocks the caregiver immediately on every read and write; replay is idempotent', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect();
    const cmd = await h.call('POST', `/relationships/${relationshipId}/plan-commands`, { auth: cg.auth, body: { baseVersion: 0, planSnapshot: h.snapshot() }, headers: { 'Idempotency-Key': 'idem-key-12345' } });
    expect(cmd.status).toBe(202);

    const rv = await h.call('POST', `/patient/relationships/${relationshipId}/revoke`, { auth: dev.auth });
    expect(rv.json.status).toBe('REVOKED_BY_PATIENT');
    expect((await h.call('POST', `/patient/relationships/${relationshipId}/revoke`, { auth: dev.auth })).json.status).toBe('REVOKED_BY_PATIENT');

    for (const [m, p, body] of [
      ['GET', `/relationships/${relationshipId}`], ['GET', `/relationships/${relationshipId}/medications`],
      ['GET', `/relationships/${relationshipId}/activity`], ['GET', `/relationships/${relationshipId}/plan-commands/${cmd.json.commandId}`],
      ['POST', `/relationships/${relationshipId}/plan-commands`, { baseVersion: 1, planSnapshot: h.snapshot() }],
    ] as Array<[string, string, unknown?]>) {
      const r = await h.call(m, p, { auth: cg.auth, body, headers: { 'Idempotency-Key': 'idem-key-67890' } });
      expect([p, r.status, r.json.error.code]).toEqual([p, 403, 'RELATIONSHIP_INACTIVE']);
    }
    expect((await h.call('GET', '/relationships', { auth: cg.auth })).json.items).toEqual([]);
    // device no longer receives the command; it was closed
    const ch = await h.call('GET', '/devices/current/changes', { auth: dev.auth });
    expect(ch.json.pendingCommands).toEqual([]);
    expect(sql(h).query('SELECT status, error_code FROM sync_commands').get()).toEqual({ status: 'SUPERSEDED', error_code: 'RELATIONSHIP_ENDED' });
    // patient still sees the revoked entry
    const pl = await h.call('GET', '/patient/relationships', { auth: dev.auth });
    expect(pl.json.items[0]).toMatchObject({ status: 'REVOKED_BY_PATIENT', caregiverDisplayName: 'Ann Carer' });
    // a fresh connection afterwards is possible
    await h.connect({ caregiver: cg, device: dev });
  });

  it('caregiver disconnect is idempotent, notifies the device with ids only, and keeps the patient data', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect();
    h.push.sent.length = 0;
    const d1 = await h.call('DELETE', `/relationships/${relationshipId}`, { auth: cg.auth });
    const d2 = await h.call('DELETE', `/relationships/${relationshipId}`, { auth: cg.auth });
    expect([d1.status, d1.json.status, d2.status, d2.json.status]).toEqual([200, 'DISCONNECTED_BY_CAREGIVER', 200, 'DISCONNECTED_BY_CAREGIVER']);
    expect((await h.call('GET', `/relationships/${relationshipId}`, { auth: cg.auth })).status).toBe(403);
    expect((await h.call('GET', '/relationships', { auth: cg.auth })).json.items).toEqual([]);
    await h.flush();
    expect(h.push.sent.map((m) => m.data)).toEqual([{ type: 'RELATIONSHIP_CHANGED', relationshipId }]);
    // the patient device registration (and thus its server-side plan store) is untouched
    expect((await h.call('GET', '/devices/current', { auth: dev.auth })).status).toBe(200);
    const pl = await h.call('GET', '/patient/relationships', { auth: dev.auth });
    expect(pl.json.items[0].status).toBe('DISCONNECTED_BY_CAREGIVER');
    // patient revoke after disconnect keeps the earlier terminal status
    expect((await h.call('POST', `/patient/relationships/${relationshipId}/revoke`, { auth: dev.auth })).json.status).toBe('DISCONNECTED_BY_CAREGIVER');
  });

  it('patient may restrict, never widen, permissions', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect({ permissions: ['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS'] });
    const ok = await h.call('PATCH', `/patient/relationships/${relationshipId}`, { auth: dev.auth, body: { permissions: ['VIEW_SCHEDULE'] } });
    expect(ok.json.relationship.permissions).toEqual(['VIEW_SCHEDULE']);
    expect(ok.json.relationship.version).toBe(2);
    const widen = await h.call('PATCH', `/patient/relationships/${relationshipId}`, { auth: dev.auth, body: { permissions: ['VIEW_SCHEDULE', 'RECEIVE_ALERTS'] } });
    expect(widen.status).toBe(400);
    expect((await h.call('GET', `/relationships/${relationshipId}/activity`, { auth: cg.auth })).status).toBe(403);
  });
});
