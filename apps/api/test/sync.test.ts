import { describe, expect, it } from 'bun:test';
import { createHarness, uuid, type Harness } from './helpers/harness';

const sql = (h: Harness) => (h.db as any).sqlite;
const K = (n: string) => ({ 'Idempotency-Key': `idem-${n}-0000` });

async function submit(h: Harness, ctx: { cg: any; relationshipId: string }, baseVersion: number, snap: unknown, key: string = uuid()) {
  return h.call('POST', `/relationships/${ctx.relationshipId}/plan-commands`, { auth: ctx.cg.auth, body: { baseVersion, planSnapshot: snap }, headers: { 'Idempotency-Key': key } });
}

describe('plan commands and device sync (14.4)', () => {
  it('command waits for phone, is received on fetch, applied on ack; caregiver sees each state', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const sub = await submit(h, ctx, 0, h.snapshot());
    expect(sub.status).toBe(202);
    expect(sub.json).toMatchObject({ status: 'PENDING_DEVICE', syncState: 'WAITING_FOR_DEVICE', planVersion: 1, baseVersion: 0 });
    const state = () => h.call('GET', `/relationships/${ctx.relationshipId}/plan-commands/${sub.json.commandId}`, { auth: ctx.cg.auth });
    expect((await state()).json.syncState).toBe('WAITING_FOR_DEVICE');

    // Device offline: nothing changes; plan read shows not-yet-applied.
    const plan = await h.call('GET', `/relationships/${ctx.relationshipId}/medications`, { auth: ctx.cg.auth });
    expect(plan.json).toMatchObject({ latestPlanVersion: 1, lastAppliedVersion: 0, isApplied: false, pendingCommand: { commandId: sub.json.commandId, status: 'PENDING_DEVICE' } });
    expect(plan.json.planSnapshot.medications[0].name).toBe('Metformin');

    const ch = await h.call('GET', '/devices/current/changes', { auth: ctx.dev.auth });
    expect(ch.json.pendingCommands).toHaveLength(1);
    expect(ch.json.pendingCommands[0]).toMatchObject({ commandId: sub.json.commandId, relationshipId: ctx.relationshipId, planVersion: 1, status: 'RECEIVED' });
    expect(ch.json.pendingCommands[0].planSnapshot.schemaVersion).toBe(2);
    expect((await state()).json).toMatchObject({ status: 'RECEIVED', syncState: 'RECEIVED_BY_DEVICE' });

    // Re-fetch before ack: redelivered (idempotent), still RECEIVED.
    const again = await h.call('GET', '/devices/current/changes', { auth: ctx.dev.auth });
    expect(again.json.pendingCommands).toHaveLength(1);

    const ack = await h.call('POST', '/devices/current/acks', { auth: ctx.dev.auth, body: { commandId: sub.json.commandId, status: 'APPLIED', appliedVersion: 1 } });
    expect(ack.json).toMatchObject({ success: true, results: [{ status: 'APPLIED', outcome: 'UPDATED' }] });
    expect((await state()).json).toMatchObject({ status: 'APPLIED', syncState: 'APPLIED', appliedVersion: 1 });
    const rel = await h.call('GET', `/relationships/${ctx.relationshipId}`, { auth: ctx.cg.auth });
    expect(rel.json.relationship).toMatchObject({ latestPlanVersion: 1, lastAppliedVersion: 1 });

    // Replayed ack / push: no double application, not redelivered.
    const replay = await h.call('POST', '/devices/current/acks', { auth: ctx.dev.auth, body: { acks: [{ commandId: sub.json.commandId, status: 'APPLIED' }], cursor: ch.json.nextCursor } });
    expect(replay.json.results[0].outcome).toBe('UNCHANGED');
    expect((await h.call('GET', '/devices/current/changes', { auth: ctx.dev.auth })).json.pendingCommands).toEqual([]);
    expect(replay.json.cursor).toBe(ch.json.nextCursor);
  });

  it('device rejection: caregiver sees REJECTED with reason; the readable plan stays intact; the next edit can rebase', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const first = await submit(h, ctx, 0, h.snapshot(h.med(uuid(), 'Aspirin')));
    await h.call('GET', '/devices/current/changes', { auth: ctx.dev.auth });
    await h.call('POST', '/devices/current/acks', { auth: ctx.dev.auth, body: { commandId: first.json.commandId, status: 'APPLIED' } });
    const second = await submit(h, ctx, 1, h.snapshot(h.med(uuid(), 'Bad drug')));
    expect(second.json.planVersion).toBe(2);
    await h.call('GET', '/devices/current/changes', { auth: ctx.dev.auth });
    const rej = await h.call('POST', '/devices/current/acks', { auth: ctx.dev.auth, body: { commandId: second.json.commandId, status: 'REJECTED', reasonCode: 'STALE_PLAN' } });
    expect(rej.json.results[0]).toMatchObject({ status: 'REJECTED', outcome: 'UPDATED' });
    const st = await h.call('GET', `/relationships/${ctx.relationshipId}/plan-commands/${second.json.commandId}`, { auth: ctx.cg.auth });
    expect(st.json).toMatchObject({ status: 'REJECTED', syncState: 'REJECTED', reasonCode: 'STALE_PLAN', appliedAt: null });
    const plan = await h.call('GET', `/relationships/${ctx.relationshipId}/medications`, { auth: ctx.cg.auth });
    expect(plan.json.planSnapshot.medications.map((m: any) => m.name)).toEqual(['Aspirin']);
    expect(plan.json).toMatchObject({ latestPlanVersion: 1, lastAppliedVersion: 1, isApplied: true });
    // rejected is terminal
    const late = await h.call('POST', '/devices/current/acks', { auth: ctx.dev.auth, body: { commandId: second.json.commandId, status: 'APPLIED' } });
    expect(late.json.results[0].outcome).toBe('INVALID_TRANSITION');
    // caregiver composes on the latest visible version
    const third = await submit(h, ctx, plan.json.latestPlanVersion, h.snapshot(h.med(uuid(), 'Aspirin'), h.med(uuid(), 'Statin')));
    expect(third.status).toBe(202);
    expect(third.json.planVersion).toBe(3);
  });

  it('stale baseVersion => 409; newer command supersedes unapplied older one', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const c1 = await submit(h, ctx, 0, h.snapshot());
    const stale = await submit(h, ctx, 0, h.snapshot());
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('PLAN_VERSION_CONFLICT');
    expect(stale.json.error.message).toContain('version 1');
    const c2 = await submit(h, ctx, 1, h.snapshot(h.med(uuid(), 'B')));
    expect(c2.status).toBe(202);
    const s1 = await h.call('GET', `/relationships/${ctx.relationshipId}/plan-commands/${c1.json.commandId}`, { auth: ctx.cg.auth });
    expect(s1.json.status).toBe('SUPERSEDED');
    const ch = await h.call('GET', '/devices/current/changes', { auth: ctx.dev.auth });
    expect(ch.json.pendingCommands.map((c: any) => c.commandId)).toEqual([c2.json.commandId]);
  });

  it('two caregivers of the same patient share one version line (second must rebase)', async () => {
    const h = createHarness();
    const a = await h.connect();
    const b = await h.connect({ device: a.dev });
    await submit(h, a, 0, h.snapshot());
    const conflict = await submit(h, b, 0, h.snapshot());
    expect(conflict.status).toBe(409);
  });

  it('Idempotency-Key replay returns the same command; mismatched body reuses key => 409; commandId works as key', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const snap = h.snapshot();
    const a = await submit(h, ctx, 0, snap, 'same-key-1234');
    const b = await submit(h, ctx, 0, snap, 'same-key-1234');
    expect(b.status).toBe(202);
    expect(b.json.commandId).toBe(a.json.commandId);
    expect(sql(h).query('SELECT COUNT(*) n FROM sync_commands').get().n).toBe(1);
    expect(sql(h).query('SELECT COUNT(*) n FROM server_outbox WHERE kind = \'PLAN_VERSION\'').get().n).toBe(1);
    const diff = await submit(h, ctx, 0, h.snapshot(h.med(uuid(), 'Other')), 'same-key-1234');
    expect(diff.status).toBe(409);
    expect(diff.json.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const cid = uuid();
    const viaBody = await h.call('POST', `/relationships/${ctx.relationshipId}/plan-commands`, { auth: ctx.cg.auth, body: { commandId: cid, baseVersion: 1, planSnapshot: h.snapshot(h.med(uuid(), 'X')) } });
    expect(viaBody.status).toBe(202);
    const none = await h.call('POST', `/relationships/${ctx.relationshipId}/plan-commands`, { auth: ctx.cg.auth, body: { baseVersion: 2, planSnapshot: h.snapshot() }, headers: { 'Idempotency-Key': 'short' } });
    expect(none.status).toBe(400);
  });

  it('rejects snapshots over 16KB with 413 and invalid snapshots with 400', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const big = h.snapshot(...Array.from({ length: 30 }, () => ({ ...h.med(), instructions: 'x'.repeat(500) })));
    expect((await submit(h, ctx, 0, big)).status).toBe(413);
    const bad = await submit(h, ctx, 0, { schemaVersion: 2, medications: [{ id: 'nope' }] });
    expect(bad.status).toBe(400);
    expect(sql(h).query('SELECT COUNT(*) n FROM sync_commands').get().n).toBe(0);
  });

  it('FCM wake-up is data-only with opaque ids; written in the same batch as the command', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    h.push.sent.length = 0;
    await submit(h, ctx, 0, h.snapshot(h.med(uuid(), 'Secret Medicine Name')));
    const ob = sql(h).query("SELECT * FROM server_outbox WHERE kind = 'PLAN_VERSION'").get();
    expect(JSON.parse(ob.payload_json)).toEqual({ type: 'PLAN_VERSION', relationshipId: ctx.relationshipId, version: '1' });
    await h.flush();
    expect(h.push.sent).toHaveLength(1);
    expect(h.push.sent[0]!.token).toBe('tok-1');
    expect(JSON.stringify(h.push.sent[0]!.data)).not.toContain('Secret');
    expect(sql(h).query("SELECT status FROM server_outbox WHERE kind = 'PLAN_VERSION'").get().status).toBe('SENT');
  });

  it('outbox retries with backoff via the sweep, and dies after max attempts', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    await h.flush();
    h.push.nextResult = { ok: false, retryable: true, code: 'FCM_503' };
    await submit(h, ctx, 0, h.snapshot());
    await h.flush();
    const row = () => sql(h).query("SELECT * FROM server_outbox WHERE kind = 'PLAN_VERSION'").get();
    expect(row()).toMatchObject({ status: 'PENDING', attempts: 1, last_error_code: 'FCM_503' });
    const { Services } = await import('../src/services');
    const { buildDeps } = await import('../src/middleware/context');
    const svc = () => new Services(buildDeps(h.env as any, { now: () => new Date(h.clock.t), push: h.push }));
    expect(await svc().outbox.sweep()).toBe(0); // backoff not elapsed
    h.clock.t += 31_000;
    expect(await svc().outbox.sweep()).toBe(1);
    expect(row().attempts).toBe(2);
    h.push.nextResult = { ok: true };
    h.clock.t += 61_000;
    await svc().outbox.sweep();
    expect(row().status).toBe('SENT');
    // permanent failure + invalid token clears the token
    h.push.nextResult = { ok: false, retryable: false, tokenInvalid: true, code: 'FCM_UNREGISTERED' };
    await submit(h, ctx, 1, h.snapshot(h.med(uuid(), 'B')));
    await h.flush();
    expect(sql(h).query('SELECT push_token FROM patient_devices').get().push_token).toBeNull();
    expect(sql(h).query("SELECT status FROM server_outbox WHERE kind='PLAN_VERSION' ORDER BY created_at DESC, rowid DESC LIMIT 1").get().status).toBe('DEAD');
  });

  it('medication endpoints build a new snapshot from the latest plan (add / patch / delete)', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const m = h.med(uuid(), 'Ramipril');
    const add = await h.call('POST', `/relationships/${ctx.relationshipId}/medications`, { auth: ctx.cg.auth, body: { baseVersion: 0, medication: m } });
    expect(add.status).toBe(202);
    const patch = await h.call('PATCH', `/relationships/${ctx.relationshipId}/medications/${m.id}`, { auth: ctx.cg.auth, body: { baseVersion: 1, medication: { dosageText: '10 mg' } } });
    expect(patch.status).toBe(202);
    const one = await h.call('GET', `/relationships/${ctx.relationshipId}/medications/${m.id}`, { auth: ctx.cg.auth });
    expect(one.json.medication.dosageText).toBe('10 mg');
    expect(one.json.latestPlanVersion).toBe(2);
    const stale = await h.call('DELETE', `/relationships/${ctx.relationshipId}/medications/${m.id}?baseVersion=1`, { auth: ctx.cg.auth });
    expect(stale.status).toBe(409);
    const del = await h.call('DELETE', `/relationships/${ctx.relationshipId}/medications/${m.id}?baseVersion=2`, { auth: ctx.cg.auth });
    expect(del.status).toBe(202);
    const ch = await h.call('GET', '/devices/current/changes', { auth: ctx.dev.auth });
    expect(ch.json.pendingCommands[0].planSnapshot).toMatchObject({ medications: [], removedMedicationIds: [m.id] });
    expect((await h.call('GET', `/relationships/${ctx.relationshipId}/medications/${m.id}`, { auth: ctx.cg.auth })).status).toBe(404);
  });

  it('device plan report: caregiver reads prescription + device status; stale/pending uploads conflict', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const m = h.med();
    const report = { schemaVersion: 2, medications: [m], status: [{ medicationId: m.id, lifecycleStatus: 'ACTIVE', dosesTakenCount: 3, currentStock: 12 }] };
    const up = await h.call('PUT', '/devices/current/plan', { auth: ctx.dev.auth, body: { baseVersion: 0, report } });
    expect(up.json).toEqual({ planVersion: 1, lastAppliedVersion: 1 });
    const plan = await h.call('GET', `/relationships/${ctx.relationshipId}/medications`, { auth: ctx.cg.auth });
    expect(plan.json).toMatchObject({ latestPlanVersion: 1, lastAppliedVersion: 1, isApplied: true, pendingCommand: null });
    expect(plan.json.planSnapshot.medications[0].id).toBe(m.id);
    expect(plan.json.deviceReport).toMatchObject({ version: 1, status: [{ medicationId: m.id, dosesTakenCount: 3, currentStock: 12 }] });
    expect((await h.call('PUT', '/devices/current/plan', { auth: ctx.dev.auth, body: { baseVersion: 0, report } })).status).toBe(409);
    const cmd = await submit(h, ctx, 1, h.snapshot(m));
    expect(cmd.status).toBe(202); // composes on the device-reported version
    const pend = await h.call('PUT', '/devices/current/plan', { auth: ctx.dev.auth, body: { baseVersion: 2, report } });
    expect(pend.status).toBe(409);
    expect(pend.json.error.code).toBe('PLAN_STALE');
  });

  it('a device cannot ack another device\'s command', async () => {
    const h = createHarness();
    const ctx = await h.connect();
    const other = await h.registerDevice('Other');
    const c = await submit(h, ctx, 0, h.snapshot());
    const r = await h.call('POST', '/devices/current/acks', { auth: other.auth, body: { commandId: c.json.commandId, status: 'APPLIED' } });
    expect(r.json.results[0].outcome).toBe('NOT_FOUND');
    expect((await h.call('GET', `/relationships/${ctx.relationshipId}/plan-commands/${c.json.commandId}`, { auth: ctx.cg.auth })).json.status).toBe('PENDING_DEVICE');
  });
});

describe('dose events and activity (14.4)', () => {
  const ev = (over: Record<string, unknown> = {}) => ({
    eventId: uuid(), occurrenceId: 'occ-1', medicationId: uuid(), eventType: 'DOSE_TAKEN',
    scheduledAt: '2026-11-09T10:00:00.000Z', actionTimestamp: '2026-11-09T10:05:00.000Z', timezoneId: 'Europe/Berlin',
    medicationName: 'Metformin', dosageText: '500 mg', ...over,
  });

  it('duplicate uploads do not duplicate; original timestamps and timezone are preserved', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect();
    h.clock.t = new Date('2026-11-09T10:20:00.000Z').getTime();
    const e = ev({ actionTimestamp: '2026-11-09T10:05:03Z' });
    const r1 = await h.call('POST', '/sync/dose-events', { auth: dev.auth, body: { events: [e, e] } });
    expect(r1.json).toMatchObject({ accepted: 1, duplicates: 1, processedCount: 2, failedEvents: [] });
    const r2 = await h.call('POST', '/sync/dose-events', { auth: dev.auth, body: { events: [e] } });
    expect(r2.json).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(sql(h).query('SELECT COUNT(*) n FROM dose_events').get().n).toBe(1);
    const act = await h.call('GET', `/relationships/${relationshipId}/activity`, { auth: cg.auth });
    expect(act.json.items).toHaveLength(1);
    expect(act.json.items[0]).toMatchObject({
      eventId: e.eventId, eventType: 'DOSE_TAKEN', statusLabel: 'Taken', scheduledAt: '2026-11-09T10:00:00.000Z',
      actionTimestamp: '2026-11-09T10:05:03.000Z', timezoneId: 'Europe/Berlin', receivedAt: '2026-11-09T10:20:00.000Z',
      patientDisplayName: 'Pat Patient', medicationName: 'Metformin',
    });
  });

  it('offline backlog uploaded later keeps original timestamps while receivedAt is server time', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect();
    h.clock.t = new Date('2026-11-09T10:20:00.000Z').getTime();
    await h.call('POST', '/sync/dose-events', { auth: dev.auth, body: { events: [ev({ actionTimestamp: '2026-11-09T10:10:00.000Z', scheduledAt: '2026-11-09T10:02:00.000Z' })] } });
    const a = (await h.call('GET', `/relationships/${relationshipId}/activity`, { auth: cg.auth })).json.items[0];
    expect(a.actionTimestamp).toBe('2026-11-09T10:10:00.000Z');
    expect(a.receivedAt).toBe('2026-11-09T10:20:00.000Z');
  });

  it('activity shows only server-received events, newest first, with cursor pagination and caregiver-safe wording', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect();
    expect((await h.call('GET', `/relationships/${relationshipId}/activity`, { auth: cg.auth })).json).toEqual({ items: [], nextCursor: null });
    const types = ['DOSE_TAKEN', 'DOSE_SKIPPED', 'DOSE_SNOOZED', 'DOSE_NOT_CONFIRMED', 'COURSE_TRANSITION_COMPLETED', 'COURSE_TRANSITION_UNDONE'];
    const events = types.map((t, i) => ev({ eventType: t, actionTimestamp: `2026-11-09T10:0${i + 1}:00.000Z`, ...(t.startsWith('COURSE') ? { scheduledAt: undefined } : {}) }));
    h.clock.t = new Date('2026-11-09T10:20:00.000Z').getTime();
    const up = await h.call('POST', '/sync/dose-events', { auth: dev.auth, body: { events: [...events].reverse() } });
    expect(up.json.accepted).toBe(6);
    const p1 = await h.call('GET', `/relationships/${relationshipId}/activity?limit=4`, { auth: cg.auth });
    expect(p1.json.items.map((i: any) => i.eventType)).toEqual(['COURSE_TRANSITION_UNDONE', 'COURSE_TRANSITION_COMPLETED', 'DOSE_NOT_CONFIRMED', 'DOSE_SNOOZED']);
    expect(p1.json.items[2].statusLabel).toBe('Not confirmed');
    expect(JSON.stringify(p1.json)).not.toMatch(/missed/i);
    expect(p1.json.nextCursor).toBeTruthy();
    const p2 = await h.call('GET', `/relationships/${relationshipId}/activity?limit=4&cursor=${p1.json.nextCursor}`, { auth: cg.auth });
    expect(p2.json.items.map((i: any) => i.eventType)).toEqual(['DOSE_SKIPPED', 'DOSE_TAKEN']);
    expect(p2.json.nextCursor).toBeNull();
    expect((await h.call('GET', `/relationships/${relationshipId}/activity?cursor=garbage`, { auth: cg.auth })).status).toBe(400);
    expect((await h.call('GET', `/relationships/${relationshipId}/activity?limit=101`, { auth: cg.auth })).status).toBe(400);
  });

  it('events from before the relationship was confirmed are never exposed', async () => {
    const h = createHarness();
    const dev = await h.registerDevice();
    h.clock.t = new Date('2026-11-09T12:00:00.000Z').getTime();
    const { cg, relationshipId } = await h.connect({ device: dev });
    await h.call('POST', '/sync/dose-events', { auth: dev.auth, body: { events: [ev({ actionTimestamp: '2026-11-01T08:00:00.000Z' }), ev({ actionTimestamp: '2026-11-09T12:30:00.000Z' })] } });
    const items = (await h.call('GET', `/relationships/${relationshipId}/activity`, { auth: cg.auth })).json.items;
    expect(items).toHaveLength(1);
  });

  it('per-event validation failures do not fail the batch; legacy type names are normalised; future timestamps rejected', async () => {
    const h = createHarness();
    const { dev, cg, relationshipId } = await h.connect();
    const good = ev({ eventType: 'UNCONFIRMED' });
    const r = await h.call('POST', '/sync/dose-events', {
      auth: dev.auth,
      body: { events: [good, ev({ eventType: 'DOSE_MISSED' }), { eventId: 'nope' }, ev({ actionTimestamp: '2030-01-01T00:00:00.000Z' }), ev({ eventType: 'DOSE_TAKEN', scheduledAt: undefined })] },
    });
    expect(r.status).toBe(200);
    expect(r.json.accepted).toBe(1);
    expect(r.json.failedEvents.map((f: any) => [f.index, f.code])).toEqual([[1, 'INVALID_EVENT'], [2, 'INVALID_EVENT'], [3, 'FUTURE_TIMESTAMP'], [4, 'INVALID_EVENT']]);
    const items = (await h.call('GET', `/relationships/${relationshipId}/activity`, { auth: cg.auth })).json.items;
    expect(items[0].eventType).toBe('DOSE_NOT_CONFIRMED');
    expect((await h.call('POST', '/sync/dose-events', { auth: dev.auth, body: { events: [] } })).status).toBe(400);
    expect((await h.call('POST', '/sync/dose-events', { body: { events: [good] } })).status).toBe(401);
  });

  it('fabricated relationshipId in events is ignored; events attach to the authenticated device only', async () => {
    const h = createHarness();
    const a = await h.connect();
    const b = await h.connect();
    h.clock.t = new Date('2026-11-09T10:20:00.000Z').getTime();
    await h.call('POST', '/sync/dose-events', { auth: a.dev.auth, body: { events: [ev({ relationshipId: b.relationshipId })] } });
    expect((await h.call('GET', `/relationships/${b.relationshipId}/activity`, { auth: b.cg.auth })).json.items).toEqual([]);
    expect((await h.call('GET', `/relationships/${a.relationshipId}/activity`, { auth: a.cg.auth })).json.items).toHaveLength(1);
  });

  it('revoked relationship returns no activity or medication data; the stored events remain for the patient side', async () => {
    const h = createHarness();
    const { cg, dev, relationshipId } = await h.connect();
    h.clock.t = new Date('2026-11-09T10:20:00.000Z').getTime();
    await h.call('POST', '/sync/dose-events', { auth: dev.auth, body: { events: [ev()] } });
    await h.call('POST', `/patient/relationships/${relationshipId}/revoke`, { auth: dev.auth });
    for (const p of ['activity', 'medications']) {
      const r = await h.call('GET', `/relationships/${relationshipId}/${p}`, { auth: cg.auth });
      expect(r.status).toBe(403);
      expect(r.text).not.toContain('Metformin');
    }
    expect(sql(h).query('SELECT COUNT(*) n FROM dose_events').get().n).toBe(1);
  });
});
