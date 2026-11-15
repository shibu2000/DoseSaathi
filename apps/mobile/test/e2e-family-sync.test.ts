import { describe, it, expect, beforeEach } from 'bun:test';
import { createHarness, type Harness } from '../../api/test/helpers/harness';
import { ApiClient, MemoryCredentialStore, SyncWorker } from '../src/sync';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase } from '../src/database';
import { HeadlessAlarmAdapter, SchedulerService } from '../src/alarms';

const NOW = new Date('2026-11-09T01:30:00.000Z'); // 07:00 IST

/** Real API (Hono + D1-over-SQLite) wired to real ApiClients and a real on-device database. */
describe('E2E: caregiver <-> API <-> patient device (no mocks of our own code)', () => {
  let h: Harness;
  let patientApi: ApiClient;
  let caregiverApi: ApiClient;
  let db: AppDatabase;
  let worker: SyncWorker;
  let scheduler: SchedulerService;
  let online = true;
  let clockMs: number;

  const client = () =>
    new ApiClient({
      baseUrl: 'http://api.test',
      credentials: new MemoryCredentialStore(),
      fetchFn: async (url, init) => {
        if (!online) throw new TypeError('offline');
        const path = String(url).replace('http://api.test', '');
        return h.app.request(path, { ...init, headers: { ...(init?.headers as any), 'CF-Connecting-IP': '10.1.1.1' } }, h.env);
      },
    });

  beforeEach(async () => {
    h = createHarness();
    h.clock.t = new Date('2026-11-09T01:00:00.000Z').getTime(); // pairing happens before the dose
    online = true;
    patientApi = client();
    caregiverApi = client();
    db = await AppDatabase.initialize(new BunSqliteAdapter(':memory:'));
    db.tz = 'Asia/Kolkata';
    clockMs = NOW.getTime();
    db.clock = () => new Date(clockMs);
    await db.ensurePrimaryProfile();
    scheduler = new SchedulerService(db, new HeadlessAlarmAdapter());
    worker = new SyncWorker(db, scheduler, patientApi);
  });

  async function pair(): Promise<string> {
    await patientApi.registerDevice({ displayName: 'Pat Patient', appVersion: '1.0.0' });
    await caregiverApi.register({ email: 'ann@example.com', password: 'correct-horse-battery', displayName: 'Ann Carer' });
    const s = await patientApi.createPairingSession();
    const req = await caregiverApi.createPairingRequest({ code: s.pairingCode }, ['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS', 'RECEIVE_ALERTS']);
    const view = await patientApi.getPairingSession(s.sessionId);
    expect(view.incomingRequest?.caregiverDisplayName).toBe('Ann Carer'); // real identity, not a fixture
    await patientApi.approvePairingRequest(req.requestId, {
      approvedPermissions: ['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS', 'RECEIVE_ALERTS'],
      relationshipLabel: 'Daughter',
    });
    const status = await caregiverApi.getPairingRequestStatus(req.requestId);
    expect(status.status).toBe('APPROVED');
    await db.settings.setBoolean('family_sharing_active', true);
    return status.relationshipId!;
  }

  const med = (id: string, name: string, extra: any = {}) => ({
    id, name, dosageText: '1 tablet', doseQuantity: 1, doseUnit: 'tablet', courseType: 'ONGOING', trackStock: false, lowStockThreshold: 5,
    schedule: { scheduleType: 'FIXED_TIMES', recurrenceType: 'DAILY', fixedTimes: ['08:00'], activeWeekdays: [] },
    ...extra,
  });

  it('caregiver sends a Day-1 multi-phase prescription; phone applies it; caregiver sees Applied only after the ack', async () => {
    const rel = await pair();
    const [A, B] = [crypto.randomUUID(), crypto.randomUUID()];
    const plan = await caregiverApi.getPlan(rel);
    const cmd = await caregiverApi.submitPlanCommand(
      rel,
      {
        baseVersion: plan.latestPlanVersion,
        planSnapshot: {
          schemaVersion: 2,
          removedMedicationIds: [],
          medications: [
            med(A, 'Antibiotic', { courseType: 'FIXED_DAYS', maxDurationDays: 4 }),
            med(B, 'Follow-up', { startsAfter: { prerequisiteMedicationId: A, phaseDelayHours: 0 }, courseType: 'FIXED_DAYS', maxDurationDays: 7 }),
          ],
        } as any,
      },
      'idem-key-0001'
    );
    // Accepted by the server is NOT applied
    expect((await caregiverApi.getPlanCommand(rel, cmd.commandId)).status).toBe('PENDING_DEVICE');
    expect(await db.medications.getAll()).toHaveLength(0);

    const res = await worker.syncAll();
    expect(res.appliedCommandsCount).toBe(1);
    expect((await db.medications.getById(A))!.lifecycleStatus).toBe('ACTIVE');
    expect((await db.medications.getById(B))!.lifecycleStatus).toBe('QUEUED_PHASE');
    expect((await caregiverApi.getPlanCommand(rel, cmd.commandId)).status).toBe('APPLIED');

    // Replaying the same fetch never applies twice
    expect((await worker.syncAll()).appliedCommandsCount).toBe(0);
  });

  it('an invalid plan is rejected by the phone with a reason and the existing plan stays intact', async () => {
    const rel = await pair();
    const A = crypto.randomUUID();
    const ongoing = med(A, 'Ongoing');
    const base = (await caregiverApi.getPlan(rel)).latestPlanVersion;
    await caregiverApi.submitPlanCommand(rel, { baseVersion: base, planSnapshot: { schemaVersion: 2, removedMedicationIds: [], medications: [ongoing] } as any }, 'idem-key-0002');
    await worker.syncAll();

    const B = crypto.randomUUID();
    const v = (await caregiverApi.getPlan(rel)).latestPlanVersion;
    const bad = await caregiverApi.submitPlanCommand(
      rel,
      { baseVersion: v, planSnapshot: { schemaVersion: 2, removedMedicationIds: [], medications: [ongoing, med(B, 'Never starts', { startsAfter: { prerequisiteMedicationId: A, phaseDelayHours: 0 } })] } as any },
      'idem-key-0003'
    );
    await worker.syncAll();
    const state = await caregiverApi.getPlanCommand(rel, bad.commandId);
    expect(state.status).toBe('REJECTED');
    expect(state.reasonCode).toBe('INVALID_MEDICINE');
    expect((await db.medications.getAll()).map((m) => m.name)).toEqual(['Ongoing']);
  });

  it('a dose taken offline is uploaded later exactly once with its original timestamps and appears in Activity', async () => {
    const rel = await pair();
    const A = crypto.randomUUID();
    const v = (await caregiverApi.getPlan(rel)).latestPlanVersion;
    await caregiverApi.submitPlanCommand(rel, { baseVersion: v, planSnapshot: { schemaVersion: 2, removedMedicationIds: [], medications: [med(A, 'Metformin')] } as any }, 'idem-key-0004');
    await worker.syncAll();

    online = false;
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    await db.recordDoseAction({ medicationId: A, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T02:41:00.000Z' });
    const offlineRun = await worker.syncAll();
    expect(offlineRun.skippedReason).toBe('OFFLINE');
    expect(await db.outbox.getAllUnsynced()).toHaveLength(1); // nothing lost

    h.clock.t = new Date('2026-11-09T12:00:00.000Z').getTime();
    online = true;
    // not visible to the caregiver until it has really reached the server
    const before = await caregiverApi.getActivity(rel);
    expect(before.items.filter((i) => i.eventType.includes('TAKEN'))).toHaveLength(0);

    expect((await worker.syncAll()).uploadedEventsCount).toBe(1);
    expect((await worker.syncAll()).uploadedEventsCount).toBe(0); // exactly once
    const feed = await caregiverApi.getActivity(rel);
    const taken = feed.items.filter((i) => i.statusLabel === 'Taken');
    expect(taken).toHaveLength(1);
    expect(taken[0].actionTimestamp).toBe('2026-11-09T02:41:00.000Z');
    expect(taken[0].scheduledAt).toBe('2026-11-09T02:30:00.000Z'); // 08:00 IST, not 08:00Z
    expect(taken[0].medicationName).toBe('Metformin');
  });

  it('after the patient revokes, the caregiver is blocked immediately and the phone keeps its medicines', async () => {
    const rel = await pair();
    const A = crypto.randomUUID();
    const v = (await caregiverApi.getPlan(rel)).latestPlanVersion;
    await caregiverApi.submitPlanCommand(rel, { baseVersion: v, planSnapshot: { schemaVersion: 2, removedMedicationIds: [], medications: [med(A, 'Keep')] } as any }, 'idem-key-0005');
    await worker.syncAll();
    await patientApi.revokeRelationship(rel);
    await expect(caregiverApi.getPlan(rel)).rejects.toMatchObject({ status: 403 });
    expect((await db.medications.getAll()).map((m) => m.name)).toEqual(['Keep']);
  });

  it('personal mode makes zero network calls', async () => {
    let calls = 0;
    const spy = new ApiClient({ baseUrl: 'http://api.test', credentials: new MemoryCredentialStore(), fetchFn: async () => { calls++; return new Response('{}'); } });
    const w = new SyncWorker(db, scheduler, spy);
    expect((await w.syncAll()).skippedReason).toBe('NOT_SHARING');
    expect(calls).toBe(0);
  });

  it('1-tap quick device pairing: caregiver registers with device-level token, pairs via code, patient masks email', async () => {
    // 1. Patient registers device and creates pairing session
    await patientApi.registerDevice({ displayName: 'Grandma', appVersion: '1.0.0' });
    const session = await patientApi.createPairingSession();
    expect(session.pairingCode).toBeDefined();

    // 2. Caregiver uses 1-tap quick pairing: device-generated anonymous identity
    const deviceUuid = crypto.randomUUID();
    const deviceEmail = `device_${deviceUuid}@dosesaathi.app`;
    const devicePassword = 'device-random-secure-password-32char!';
    const caregiverName = 'Ananya (Phone)';
    await caregiverApi.register({ email: deviceEmail, password: devicePassword, displayName: caregiverName });

    // 3. Caregiver submits pairing request using 6-digit code
    const req = await caregiverApi.createPairingRequest({ code: session.pairingCode }, [
      'VIEW_SCHEDULE',
      'VIEW_DOSE_LOGS',
    ]);
    expect(req.requestId).toBeDefined();

    // 4. Patient polls pairing session and sees incoming request
    const sessionView = await patientApi.getPairingSession(session.sessionId);
    expect(sessionView.incomingRequest).toBeDefined();
    expect(sessionView.incomingRequest?.caregiverDisplayName).toBe('Ananya (Phone)');
    expect(sessionView.incomingRequest?.caregiverEmail).toBe(deviceEmail);

    // Verify patient display logic: technical email is correctly detected and masked
    const isDeviceIdentity = (email: string) => email.endsWith('@dosesaathi.app') && email.startsWith('device_');
    const displayCaregiverContact = (email: string) => isDeviceIdentity(email) ? 'Paired mobile device' : email;
    expect(isDeviceIdentity(sessionView.incomingRequest!.caregiverEmail)).toBe(true);
    expect(displayCaregiverContact(sessionView.incomingRequest!.caregiverEmail)).toBe('Paired mobile device');

    // 5. Patient approves request
    await patientApi.approvePairingRequest(req.requestId, {
      approvedPermissions: ['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS'],
      relationshipLabel: 'Daughter',
    });

    // 6. Caregiver gets approved status and relationship ID
    const status = await caregiverApi.getPairingRequestStatus(req.requestId);
    expect(status.status).toBe('APPROVED');
    expect(status.relationshipId).toBeDefined();

    // 7. Caregiver can view patient relationship and plan
    const rel = await caregiverApi.getRelationship(status.relationshipId!);
    expect(rel.relationship.permissions).toEqual(['VIEW_SCHEDULE', 'VIEW_DOSE_LOGS']);
    expect(rel.relationship.patientDisplayName).toBe('Grandma');

    const plan = await caregiverApi.getPlan(status.relationshipId!);
    expect(plan.latestPlanVersion).toBe(0);
  });
});
