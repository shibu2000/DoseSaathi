import { createApp } from '../../src/index';
import { createTestDb } from './d1';
import type { PushDispatcher, PushMessage, PushResult } from '../../src/services/push/dispatcher';

export class FakePush implements PushDispatcher {
  enabled = true;
  sent: PushMessage[] = [];
  nextResult: PushResult = { ok: true };
  async send(m: PushMessage) {
    this.sent.push(m);
    return this.nextResult;
  }
}

export const uuid = () => crypto.randomUUID();

export function createHarness() {
  const db = createTestDb();
  const clock = { t: new Date('2026-11-09T10:00:00.000Z').getTime() };
  const push = new FakePush();
  const pending: Promise<unknown>[] = [];
  const app = createApp({ now: () => new Date(clock.t), push, schedule: (p) => void pending.push(p) });
  const env = { DB: db, JWT_SECRET: 'test-secret-test-secret-test-secret!', PAIRING_PEPPER: 'pepper', PASSWORD_HASH_ITERATIONS: '1000' };
  let ipCounter = 0;

  async function call(method: string, path: string, opts: { auth?: string; body?: unknown; headers?: Record<string, string>; ip?: string } = {}) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': opts.ip ?? `10.0.0.${(ipCounter++ % 250) + 1}`, ...(opts.headers ?? {}) };
    if (opts.auth) headers.Authorization = opts.auth;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await app.request(`/api/v1${path}`, { method, headers, body }, env);
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    return { status: res.status, json, headers: res.headers, text };
  }

  async function flush() {
    while (pending.length) await pending.shift();
  }

  async function registerCaregiver(name = 'Ann Carer', email = `${uuid().slice(0, 8)}@example.com`) {
    const r = await call('POST', '/auth/register', { body: { email, password: 'correct-horse-battery', displayName: name } });
    if (r.status !== 201) throw new Error('register failed ' + r.text);
    return { ...r.json, auth: `Bearer ${r.json.accessToken}`, email, name } as { auth: string; refreshToken: string; accessToken: string; caregiver: { id: string }; email: string; name: string };
  }

  async function registerDevice(displayName: string | undefined = 'Pat Patient', pushToken: string | null = 'tok-1') {
    const r = await call('POST', '/devices/register', { body: { platform: 'android', appVersion: '1.0.0', displayName, pushToken } });
    if (r.status !== 201) throw new Error('device register failed ' + r.text);
    return { id: r.json.deviceId as string, secret: r.json.deviceSecret as string, auth: `Device ${r.json.deviceId}.${r.json.deviceSecret}` };
  }

  const ALL = ['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS', 'RECEIVE_ALERTS'];
  /** Full pairing flow; returns ids. */
  async function connect(opts: { permissions?: string[]; approved?: string[]; caregiver?: Awaited<ReturnType<typeof registerCaregiver>>; device?: Awaited<ReturnType<typeof registerDevice>> } = {}) {
    const cg = opts.caregiver ?? (await registerCaregiver());
    const dev = opts.device ?? (await registerDevice());
    const s = await call('POST', '/pairing/sessions', { auth: dev.auth });
    const req = await call('POST', '/pairing/requests', { auth: cg.auth, body: { code: s.json.pairingCode, requestedPermissions: opts.permissions ?? ALL } });
    if (req.status !== 201) throw new Error('request failed ' + req.text);
    const ap = await call('POST', `/pairing/requests/${req.json.requestId}/approve`, {
      auth: dev.auth, body: { approvedPermissions: opts.approved ?? opts.permissions ?? ALL, relationshipLabel: 'Daughter' },
    });
    if (ap.status !== 200) throw new Error('approve failed ' + ap.text);
    return { cg, dev, relationshipId: ap.json.relationshipId as string, sessionId: s.json.sessionId as string, requestId: req.json.requestId as string };
  }

  const med = (id = uuid(), name = 'Metformin') => ({
    id, name, dosageText: '500 mg',
    schedule: { scheduleType: 'FIXED_TIMES', recurrenceType: 'DAILY', fixedTimes: ['08:00'] },
  });
  const snapshot = (...meds: any[]) => ({ schemaVersion: 2, medications: meds.length ? meds : [med()], removedMedicationIds: [] });

  return { app, db, env, clock, push, call, flush, registerCaregiver, registerDevice, connect, med, snapshot, ALL };
}
export type Harness = ReturnType<typeof createHarness>;
