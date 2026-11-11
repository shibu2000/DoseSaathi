import { describe, expect, it, beforeEach } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase } from '../src/database/database';
import { runMigrations } from '../src/database/migrations/migrator';
import type { Medication, Schedule } from '@medchain/contracts';

describe('Local SQLite Database & Repositories (Phase 2)', () => {
  let adapter: BunSqliteAdapter;
  let db: AppDatabase;

  const testProfile = {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: 'Eleanor Vance',
    profileType: 'PERSONAL' as const,
    timezoneId: 'America/New_York',
    createdAt: '2026-11-08T08:00:00.000Z',
    updatedAt: '2026-11-08T08:00:00.000Z',
  };

  beforeEach(async () => {
    adapter = new BunSqliteAdapter(':memory:');
    db = await AppDatabase.initialize(adapter);
    db.tz = 'UTC';
    db.clock = () => new Date('2026-11-09T03:00:00.000Z');
    await db.profiles.create(testProfile);
    await db.settings.setBoolean('family_sharing_active', true); // outbox events are only queued while sharing
  });

  it('Migration runner creates schema and is idempotent', async () => {
    const result = await runMigrations(adapter);
    // Already migrated in beforeEach, so appliedCount should be 0
    expect(result.appliedCount).toBe(0);
    expect(result.currentVersion).toBe(5);
  });

  it('ProfileRepository: create, getById, getPrimary, update', async () => {
    const profile = await db.profiles.getById(testProfile.id);
    expect(profile).toBeDefined();
    expect(profile?.displayName).toBe('Eleanor Vance');

    const primary = await db.profiles.getPrimary();
    expect(primary?.id).toBe(testProfile.id);

    await db.profiles.update({ id: testProfile.id, displayName: 'Eleanor Vance Updated' });
    const updated = await db.profiles.getById(testProfile.id);
    expect(updated?.displayName).toBe('Eleanor Vance Updated');
  });

  it('MedicationRepository: CRUD, stock tracking, and lifecycle filtering', async () => {
    const med: Medication = {
      id: '11111111-1111-4111-8111-111111111111',
      profileId: testProfile.id,
      name: 'Metformin',
      dosageText: '500 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      instructions: 'Take with food',
      lifecycleStatus: 'ACTIVE',
      courseType: 'ONGOING',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      dosesTakenCount: 0,
      trackStock: true,
      currentStock: 30,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    };

    await db.medications.create(med);
    const retrieved = await db.medications.getById(med.id);
    expect(retrieved?.name).toBe('Metformin');
    expect(retrieved?.trackStock).toBe(true);
    expect(retrieved?.currentStock).toBe(30);

    const activeList = await db.medications.getByLifecycle('ACTIVE', testProfile.id);
    expect(activeList).toHaveLength(1);

    // Stock decrement & dose count
    const stockResult = await db.medications.recordDoseTaken(med.id, 1);
    expect(stockResult.newStock).toBe(29);
    expect(stockResult.dosesTakenCount).toBe(1);

    const afterTaken = await db.medications.getById(med.id);
    expect(afterTaken?.currentStock).toBe(29);
    expect(afterTaken?.dosesTakenCount).toBe(1);
  });

  it('ScheduleRepository: creates schedule and schedule times, retrieves joined', async () => {
    const medId = '11111111-1111-4111-8111-111111111111';
    await db.medications.create({
      id: medId,
      profileId: testProfile.id,
      name: 'Metformin',
      dosageText: '500 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      lifecycleStatus: 'ACTIVE',
      courseType: 'ONGOING',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      dosesTakenCount: 0,
      trackStock: false,
      currentStock: 0,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    });

    const sched: Schedule = {
      id: '22222222-2222-4222-8222-222222222222',
      medicationId: medId,
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'SPECIFIC_DAYS',
      startDate: '2026-11-01',
      timezoneId: 'America/New_York',
      fixedTimes: ['08:00', '20:00'],
      activeWeekdays: [1, 3, 5],
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    };

    await db.schedules.create(sched);
    const retrieved = await db.schedules.getByMedicationId(sched.medicationId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.fixedTimes).toEqual(['08:00', '20:00']);
    expect(retrieved?.activeWeekdays).toEqual([1, 3, 5]);
  });

  it('OccurrenceRepository: batch insertion and date filtering', async () => {
    const medId = 'med-1';
    await db.medications.create({
      id: medId,
      profileId: testProfile.id,
      name: 'Aspirin',
      dosageText: '81 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      lifecycleStatus: 'ACTIVE',
      courseType: 'ONGOING',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      dosesTakenCount: 0,
      trackStock: false,
      currentStock: 0,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    });

    const occs = [
      {
        occurrenceId: 'occ-1',
        medicationId: medId,
        scheduledLocalDate: '2026-11-08',
        scheduledLocalTime: '08:00',
        scheduledAtUtc: '2026-11-08T13:00:00.000Z',
        timezoneId: 'America/New_York',
      },
      {
        occurrenceId: 'occ-2',
        medicationId: medId,
        scheduledLocalDate: '2026-11-08',
        scheduledLocalTime: '20:00',
        scheduledAtUtc: '2026-11-09T01:00:00.000Z',
        timezoneId: 'America/New_York',
      },
    ];

    await db.occurrences.batchInsert(occs);
    const todayOccs = await db.occurrences.getByDate('2026-11-08');
    expect(todayOccs).toHaveLength(2);
    expect(todayOccs[0].scheduledLocalTime).toBe('08:00');
    expect(todayOccs[1].scheduledLocalTime).toBe('20:00');
  });

  it('Atomic recordDoseAction: TAKEN updates occurrence, logs action, decrements stock, and enqueues outbox event', async () => {
    const medId = '33333333-3333-4333-8333-333333333333';
    const med: Medication = {
      id: medId,
      profileId: testProfile.id,
      name: 'Lisinopril',
      dosageText: '10 mg',
      doseQuantity: 2,
      doseUnit: 'tablet',
      lifecycleStatus: 'ACTIVE',
      courseType: 'ONGOING',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      dosesTakenCount: 0,
      trackStock: true,
      currentStock: 20,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    };
    await db.medications.create(med);

    const occId = 'occ-lisinopril-today';
    await db.occurrences.batchInsert([
      {
        occurrenceId: occId,
        medicationId: medId,
        scheduledLocalDate: '2026-11-08',
        scheduledLocalTime: '09:00',
        scheduledAtUtc: '2026-11-08T14:00:00.000Z',
        timezoneId: 'America/New_York',
      },
    ]);

    const result = await db.recordDoseAction({
      medicationId: medId,
      occurrenceId: occId,
      action: 'TAKEN',
      scheduledAtUtc: '2026-11-08T14:00:00.000Z',
      actionTimestampUtc: '2026-11-08T14:05:00.000Z',
      timezoneId: 'America/New_York',
    });

    expect(result.courseCompleted).toBe(false);

    // Verify occurrence state
    const occ = await db.occurrences.getById(occId);
    expect(occ?.state).toBe('TAKEN');

    // Verify stock decremented by 2
    const updatedMed = await db.medications.getById(medId);
    expect(updatedMed?.currentStock).toBe(18);
    expect(updatedMed?.dosesTakenCount).toBe(1);

    // Verify dose log written
    const logs = await db.doseLogs.getHistory(medId);
    expect(logs).toHaveLength(1);
    expect(logs[0].actionTaken).toBe('TAKEN');
    expect(logs[0].doseOccurrenceId).toBe(occId);

    // Verify outbox queued
    const pendingOutbox = await db.outbox.getPending();
    expect(pendingOutbox).toHaveLength(1);
    expect(pendingOutbox[0].eventType).toBe('DOSE_TAKEN');
  });

  it('Same-day dependent dose: TAKEN triggers child dose occurrence', async () => {
    const parentMedId = 'parent-med-id';
    const childMedId = 'child-med-id';

    await db.medications.create({
      id: parentMedId,
      profileId: testProfile.id,
      name: 'Iron Supplement',
      dosageText: '65 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      lifecycleStatus: 'ACTIVE',
      courseType: 'ONGOING',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      dosesTakenCount: 0,
      trackStock: false,
      currentStock: 0,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    });

    await db.medications.create({
      id: childMedId,
      profileId: testProfile.id,
      name: 'Vitamin C',
      dosageText: '500 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      lifecycleStatus: 'ACTIVE',
      courseType: 'ONGOING',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      dosesTakenCount: 0,
      trackStock: false,
      currentStock: 0,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    });

    // Setup dependency: Vitamin C 30m after Iron
    await db.dependencies.create({
      id: 'dep-iron-vitc',
      parentMedicationId: parentMedId,
      childMedicationId: childMedId,
      dependencyType: 'SAME_DAY_AFTER_TAKEN',
      delayMinutes: 30,
      phaseDelayHours: 0,
      fallbackPolicy: 'SKIP_CHILD',
      fallbackTime: null,
      createdAt: '2026-11-01T08:00:00.000Z',
    });

    const parentOccId = 'occ-iron-1';
    await db.occurrences.batchInsert([
      {
        occurrenceId: parentOccId,
        medicationId: parentMedId,
        scheduledLocalDate: '2026-11-08',
        scheduledLocalTime: '08:00',
        scheduledAtUtc: '2026-11-08T13:00:00.000Z', // 08:00 EST
        timezoneId: 'America/New_York',
      },
    ]);

    const result = await db.recordDoseAction({
      medicationId: parentMedId,
      occurrenceId: parentOccId,
      action: 'TAKEN',
      // Taken at 08:15 local (13:15Z): the child must start 30 minutes after the ACTUAL taken time
      actionTimestampUtc: '2026-11-08T13:15:00.000Z',
    });

    expect(result.childOccurrenceScheduled).toBe(true);

    // Check occurrences for today
    const occs = await db.occurrences.getByDate('2026-11-08');
    const childOcc = occs.find((o) => o.medicationId === childMedId);
    expect(childOcc).toBeDefined();
    // 08:15 + 30m = 08:45
    expect(childOcc?.scheduledLocalTime).toBe('08:45');
  });

  it('Course completion and 5-minute atomic Undo', async () => {
    const courseId = 'course-antibiotic-1';
    const followUpId = 'followup-probiotic-2';

    await db.medications.create({
      id: courseId,
      profileId: testProfile.id,
      name: 'Amoxicillin',
      dosageText: '500 mg',
      doseQuantity: 1,
      doseUnit: 'capsule',
      lifecycleStatus: 'ACTIVE',
      courseType: 'FIXED_DOSES',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      maxTotalDoses: 3,
      dosesTakenCount: 2, // 1 more dose needed to complete
      trackStock: false,
      currentStock: 0,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    });

    await db.medications.create({
      id: followUpId,
      profileId: testProfile.id,
      name: 'Probiotic',
      dosageText: '1 capsule',
      doseQuantity: 1,
      doseUnit: 'capsule',
      lifecycleStatus: 'QUEUED_PHASE', // Waits for Amoxicillin to finish
      courseType: 'ONGOING',
      courseStartAt: '2026-11-10T08:00:00.000Z',
      dosesTakenCount: 0,
      trackStock: false,
      currentStock: 0,
      lowStockThreshold: 5,
      version: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
    });

    // Sequence dependency
    await db.dependencies.create({
      id: 'dep-amox-prob',
      parentMedicationId: courseId,
      childMedicationId: followUpId,
      dependencyType: 'AFTER_COURSE_COMPLETED',
      delayMinutes: 0,
      phaseDelayHours: 0,
      fallbackPolicy: null,
      fallbackTime: null,
      createdAt: '2026-11-01T08:00:00.000Z',
    });

    const occId = 'occ-amox-last';
    await db.occurrences.batchInsert([
      {
        occurrenceId: occId,
        medicationId: courseId,
        scheduledLocalDate: '2026-11-08',
        scheduledLocalTime: '12:00',
        scheduledAtUtc: '2026-11-08T12:00:00.000Z',
        timezoneId: 'America/New_York',
      },
    ]);

    // Taking the 3rd dose completes the course
    const actionRes = await db.recordDoseAction({
      medicationId: courseId,
      occurrenceId: occId,
      action: 'TAKEN',
      scheduledAtUtc: '2026-11-08T12:00:00.000Z',
      actionTimestampUtc: '2026-11-08T12:01:00.000Z',
      timezoneId: 'America/New_York',
    });

    expect(actionRes.courseCompleted).toBe(true);
    expect(actionRes.transitionEventId).toBeDefined();

    // Verify parent is now COMPLETED and child is ACTIVE
    const finishedCourse = await db.medications.getById(courseId);
    expect(finishedCourse?.lifecycleStatus).toBe('COMPLETED');

    const activatedChild = await db.medications.getById(followUpId);
    expect(activatedChild?.lifecycleStatus).toBe('ACTIVE');

    // Execute Undo within 2 minutes
    const undoRes = await db.undoCourseCompletion({
      transitionEventId: actionRes.transitionEventId!,
      courseId,
      currentTimestampUtc: '2026-11-08T12:03:00.000Z',
    });

    expect(undoRes.success).toBe(true);

    // Verify parent restored to ACTIVE and child restored to QUEUED_PHASE
    const restoredCourse = await db.medications.getById(courseId);
    expect(restoredCourse?.lifecycleStatus).toBe('ACTIVE');

    const restoredChild = await db.medications.getById(followUpId);
    expect(restoredChild?.lifecycleStatus).toBe('QUEUED_PHASE');

    // Verify compensating event enqueued
    const outbox = await db.outbox.getPending();
    const undoOutboxEvent = outbox.find((o) => o.eventType === 'COURSE_TRANSITION_UNDONE');
    expect(undoOutboxEvent).toBeDefined();
  });
});
