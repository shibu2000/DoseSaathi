import { describe, it, expect, beforeEach } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase, DEFAULT_WIZARD_DRAFT } from '../src/database';
import { applyPlanSnapshot, buildDevicePlanReport } from '../src/sync/plan-applier';
import type { PlanMedication, PlanSnapshotV2 } from '@medchain/contracts';

const NOW = new Date('2026-11-09T01:30:00.000Z'); // 07:00 IST
const id = () => crypto.randomUUID();

const med = (over: Partial<PlanMedication> & { id: string; name: string }): PlanMedication => ({
  dosageText: '1 tablet',
  doseQuantity: 1,
  doseUnit: 'tablet',
  courseType: 'ONGOING',
  trackStock: false,
  lowStockThreshold: 5,
  schedule: { scheduleType: 'FIXED_TIMES', recurrenceType: 'DAILY', fixedTimes: ['08:00'], activeWeekdays: [] },
  ...over,
});

describe('Remote plan application on the patient device', () => {
  let db: AppDatabase;
  let clockMs: number;
  const REL = id();

  beforeEach(async () => {
    db = await AppDatabase.initialize(new BunSqliteAdapter(':memory:'));
    db.tz = 'Asia/Kolkata';
    clockMs = NOW.getTime();
    db.clock = () => new Date(clockMs);
    await db.ensurePrimaryProfile();
  });

  const apply = (snapshot: PlanSnapshotV2 | unknown, version = 1, commandId = id()) =>
    applyPlanSnapshot(db, { commandId, relationshipId: REL, planVersion: version, snapshot });

  it('applies a Day-1 multi-phase prescription offline: A active, B/C/D queued, same-day chain preserved', async () => {
    const [A, B, C, D] = [id(), id(), id(), id()];
    const res = await apply({
      schemaVersion: 2,
      removedMedicationIds: [],
      medications: [
        med({ id: A, name: 'Antibiotic', courseType: 'FIXED_DAYS', maxDurationDays: 4 }),
        med({ id: B, name: 'B', startsAfter: { prerequisiteMedicationId: A, phaseDelayHours: 0 }, courseType: 'FIXED_DAYS', maxDurationDays: 7 }),
        med({
          id: C, name: 'C',
          schedule: { scheduleType: 'SAME_DAY_DEPENDENT', recurrenceType: 'DAILY', fixedTimes: [], activeWeekdays: [] },
          sameDay: { parentMedicationId: B, delayMinutes: 30 },
          startsAfter: { prerequisiteMedicationId: A, phaseDelayHours: 0 },
          courseType: 'FIXED_DAYS', maxDurationDays: 7,
        }),
        med({ id: D, name: 'D', schedule: { scheduleType: 'FIXED_TIMES', recurrenceType: 'DAILY', fixedTimes: ['21:00'], activeWeekdays: [] }, startsAfter: { prerequisiteMedicationId: A, phaseDelayHours: 0 }, courseType: 'FIXED_DAYS', maxDurationDays: 7 }),
      ],
    });
    expect(res.status).toBe('APPLIED');
    const status = async (x: string) => (await db.medications.getById(x))!.lifecycleStatus;
    expect(await status(A)).toBe('ACTIVE');
    expect(await status(B)).toBe('QUEUED_PHASE');
    expect(await status(C)).toBe('QUEUED_PHASE');
    expect(await status(D)).toBe('QUEUED_PHASE');
    expect((await db.dependencies.getChildren(B)).map((d) => d.childMedicationId)).toEqual([C]);

    // Day 5, phone was off at the boundary and offline: transition happens locally with no network
    clockMs += 4 * 24 * 3600 * 1000;
    const done = await db.completeDueCalendarCourses();
    expect(done).toHaveLength(1);
    expect(await status(A)).toBe('COMPLETED');
    expect(await status(B)).toBe('ACTIVE');
    expect(await status(C)).toBe('ACTIVE');
    expect(await status(D)).toBe('ACTIVE');
  });

  it('a repeated push / re-fetch of the same command applies exactly once', async () => {
    const A = id();
    const snapshot = { schemaVersion: 2, medications: [med({ id: A, name: 'A' })], removedMedicationIds: [] };
    const cmd = id();
    expect((await apply(snapshot, 1, cmd)).status).toBe('APPLIED');
    expect((await apply(snapshot, 1, cmd)).status).toBe('ALREADY_APPLIED');
    expect(await db.medications.getAll()).toHaveLength(1);
  });

  it('a caregiver edit changes the prescription but never resets the patient\'s progress', async () => {
    const A = id();
    await apply({ schemaVersion: 2, medications: [med({ id: A, name: 'A', courseType: 'FIXED_DOSES', maxTotalDoses: 6, trackStock: true, initialStock: 20 })], removedMedicationIds: [] }, 1);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    await db.recordDoseAction({ medicationId: A, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T02:40:00.000Z' });

    const res = await apply({ schemaVersion: 2, medications: [med({ id: A, name: 'A (renamed)', courseType: 'FIXED_DOSES', maxTotalDoses: 8, trackStock: true, initialStock: 999, schedule: { scheduleType: 'FIXED_TIMES', recurrenceType: 'DAILY', fixedTimes: ['09:00', '21:00'], activeWeekdays: [] } })], removedMedicationIds: [] }, 2);
    expect(res.status).toBe('APPLIED');
    const m = (await db.medications.getById(A))!;
    expect(m.name).toBe('A (renamed)');
    expect(m.maxTotalDoses).toBe(8);
    expect(m.dosesTakenCount).toBe(1); // progress preserved
    expect(m.currentStock).toBe(19); // device-owned stock, not the caregiver's 999
    const sched = (await db.schedules.getByMedicationId(A))!;
    expect(sched.fixedTimes).toEqual(['09:00', '21:00']); // the schedule edit really took effect
    expect(await db.connection.all(`SELECT 1 FROM medication_schedules WHERE medication_id = ?;`, [A])).toHaveLength(1);
  });

  it('rejects the whole plan and rolls back when any medicine is invalid; existing plan stays intact', async () => {
    const A = id();
    await apply({ schemaVersion: 2, medications: [med({ id: A, name: 'Keep me' })], removedMedicationIds: [] }, 1);
    const [X, Y] = [id(), id()];
    const res = await apply({
      schemaVersion: 2,
      removedMedicationIds: [],
      medications: [
        med({ id: X, name: 'X', startsAfter: { prerequisiteMedicationId: Y, phaseDelayHours: 0 }, courseType: 'FIXED_DAYS', maxDurationDays: 2 }),
        med({ id: Y, name: 'Y', startsAfter: { prerequisiteMedicationId: X, phaseDelayHours: 0 }, courseType: 'FIXED_DAYS', maxDurationDays: 2 }),
      ],
    }, 2);
    expect(res).toMatchObject({ status: 'REJECTED', code: 'DEPENDENCY_CYCLE' });
    expect((await db.medications.getAll()).map((m) => m.name)).toEqual(['Keep me']);
  });

  it('rolls back earlier medicines when a later one fails (all-or-nothing)', async () => {
    const [G, ENDLESS, BAD] = [id(), id(), id()];
    const res = await apply({
      schemaVersion: 2,
      removedMedicationIds: [],
      medications: [
        med({ id: G, name: 'Good' }),
        med({ id: ENDLESS, name: 'Ongoing parent' }),
        med({ id: BAD, name: 'Bad', startsAfter: { prerequisiteMedicationId: ENDLESS, phaseDelayHours: 0 } }),
      ],
    });
    expect(res.status).toBe('REJECTED');
    expect(await db.medications.getAll()).toHaveLength(0);
  });

  it('a malformed or future-version payload is rejected with a reason, never half-applied', async () => {
    const res = await apply({ schemaVersion: 3, medications: [] });
    expect(res).toMatchObject({ status: 'REJECTED', code: 'INVALID_PLAN' });
    const again = await apply({ schemaVersion: 3, medications: [] }, 1, 'not-a-uuid' as any);
    expect(again.status === 'REJECTED' || again.status === 'ALREADY_APPLIED').toBe(true);
  });

  it('never lets a caregiver change or remove a medicine the patient added themselves', async () => {
    const own = await db.createMedicationWithSchedule({ ...DEFAULT_WIZARD_DRAFT, name: 'My own', dosageText: '1', courseType: 'ONGOING', currentStep: 4 });
    const res = await apply({ schemaVersion: 2, medications: [med({ id: own.medication.id, name: 'Hijacked' })], removedMedicationIds: [] });
    expect(res).toMatchObject({ status: 'REJECTED', code: 'NOT_CAREGIVER_MEDICINE' });
    expect((await db.medications.getById(own.medication.id))!.name).toBe('My own');

    const res2 = await apply({ schemaVersion: 2, medications: [], removedMedicationIds: [own.medication.id] });
    expect(res2).toMatchObject({ status: 'REJECTED', code: 'NOT_CAREGIVER_MEDICINE' });
    expect((await db.medications.getById(own.medication.id))!.lifecycleStatus).toBe('ACTIVE'); // untouched
  });

  it('a caregiver edit that echoes the patient\'s own unchanged medicines is accepted', async () => {
    const own = await db.createMedicationWithSchedule({ ...DEFAULT_WIZARD_DRAFT, name: 'My own', dosageText: '1', courseType: 'ONGOING', currentStep: 4 });
    const report = await buildDevicePlanReport(db);
    const A = id();
    const res = await apply({ schemaVersion: 2, removedMedicationIds: [], medications: [...report.medications, med({ id: A, name: 'From caregiver' })] });
    expect(res.status).toBe('APPLIED');
    expect((await db.medications.getById(own.medication.id))!.name).toBe('My own');
    expect((await db.medications.getById(A))!.name).toBe('From caregiver');
  });

  it('removing a caregiver medicine retires it and its pending alarms but keeps history', async () => {
    const A = id();
    await apply({ schemaVersion: 2, medications: [med({ id: A, name: 'A' })], removedMedicationIds: [] }, 1);
    await apply({ schemaVersion: 2, medications: [], removedMedicationIds: [A] }, 2);
    expect((await db.medications.getById(A))!.lifecycleStatus).toBe('COMPLETED');
    expect((await db.occurrences.getByDate('2026-11-09')).filter((o) => o.medicationId === A && o.state === 'SCHEDULED')).toHaveLength(0);
  });

  it('device report mirrors prescription + real progress, and stays small', async () => {
    const [A, B] = [id(), id()];
    await apply({ schemaVersion: 2, medications: [med({ id: A, name: 'A', courseType: 'FIXED_DAYS', maxDurationDays: 3 }), med({ id: B, name: 'B', startsAfter: { prerequisiteMedicationId: A, phaseDelayHours: 0 } })], removedMedicationIds: [] });
    const report = await buildDevicePlanReport(db);
    expect(report.medications.map((m) => m.name).sort()).toEqual(['A', 'B']);
    expect(report.status.find((s) => s.medicationId === B)!.lifecycleStatus).toBe('QUEUED_PHASE');
    expect(report.medications.find((m) => m.id === B)!.startsAfter!.prerequisiteMedicationId).toBe(A);
    expect(JSON.stringify(report).length).toBeLessThan(4096);
  });
});
