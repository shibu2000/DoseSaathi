import type { DatabaseConnection } from './types';
import { generateUUID } from '../utils/uuid';
import { runMigrations } from './migrations/migrator';
import { ProfileRepository } from './repositories/profile-repository';
import { MedicationRepository } from './repositories/medication-repository';
import { ScheduleRepository } from './repositories/schedule-repository';
import { DependencyRepository } from './repositories/dependency-repository';
import { OccurrenceRepository, type DoseOccurrenceRow } from './repositories/occurrence-repository';
import { DoseLogRepository } from './repositories/dose-log-repository';
import { CourseTransitionRepository } from './repositories/course-transition-repository';
import { SyncOutboxRepository } from './repositories/sync-outbox-repository';
import { DraftRepository, type WizardDraft } from './repositories/draft-repository';
import { DeviceSettingsRepository } from './repositories/device-settings-repository';
import { RelationshipCacheRepository, type CachedRelationship } from './repositories/relationship-cache-repository';
import {
  evaluateDependentDose,
  isCourseComplete,
  completeCourseAndFanOut,
  undoCourseTransition,
  generateOccurrencesForRange,
  forecastMedicationStock,
  fixedDaysCompletionInstant,
  localDateInZone,
  utcToZonedParts,
  zonedDateTimeToUtc,
  addDays,
} from '@medchain/domain';
import type { Medication, Schedule, DoseEventType } from '@medchain/contracts';

export interface OccurrenceWithMedication extends DoseOccurrenceRow {
  medication: Medication;
}

/** Minutes after which an unacknowledged dose is reported as "not confirmed" (SRS 3.4.3). */
export const UNCONFIRMED_AFTER_MINUTES = 30;
export const SNOOZE_MINUTES = 10;

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface DoseActionResult {
  /** False when the occurrence was already Taken/Skipped, so nothing was changed (idempotent replay). */
  applied: boolean;
  courseCompleted: boolean;
  childOccurrenceScheduled: boolean;
  transitionEventId?: string;
  /** Names of medicines that start after the completed course. */
  activatedMedicationNames?: string[];
  /** True when this Taken action newly pushed the medicine to/below its low-stock threshold. */
  lowStock?: { medicationId: string; name: string; daysRemaining: number; currentStock: number } | null;
}

export class AppDatabase {
  public profiles: ProfileRepository;
  public medications: MedicationRepository;
  public schedules: ScheduleRepository;
  public dependencies: DependencyRepository;
  public occurrences: OccurrenceRepository;
  public doseLogs: DoseLogRepository;
  public courseTransitions: CourseTransitionRepository;
  public outbox: SyncOutboxRepository;
  public drafts: DraftRepository;
  public settings: DeviceSettingsRepository;
  public relationshipCache: RelationshipCacheRepository;
  /** Injectable clock so time-dependent behaviour is deterministic in tests. */
  public clock: () => Date = () => new Date();
  /** Time-zone override (tests). Defaults to the device zone, the alarm-executing zone (docs/decisions/0006). */
  public tz: string | null = null;
  timeZone(): string {
    return this.tz ?? deviceTimeZone();
  }

  constructor(public connection: DatabaseConnection) {
    this.profiles = new ProfileRepository(connection);
    this.medications = new MedicationRepository(connection);
    this.schedules = new ScheduleRepository(connection);
    this.dependencies = new DependencyRepository(connection);
    this.occurrences = new OccurrenceRepository(connection);
    this.doseLogs = new DoseLogRepository(connection);
    this.courseTransitions = new CourseTransitionRepository(connection);
    this.outbox = new SyncOutboxRepository(connection);
    this.drafts = new DraftRepository(connection);
    this.settings = new DeviceSettingsRepository(connection);
    this.relationshipCache = new RelationshipCacheRepository(connection);
  }

  static async initialize(connection: DatabaseConnection): Promise<AppDatabase> {
    await runMigrations(connection);
    return new AppDatabase(connection);
  }

  /**
   * Queues a sync event for caregivers, in the caller's transaction. Events are only queued while
   * family sharing is active: Personal Mode never accumulates cloud work or uploads history.
   */
  private async enqueueEvent(item: Parameters<SyncOutboxRepository['enqueue']>[0]): Promise<void> {
    if (await this.settings.getBoolean('family_sharing_active', false)) {
      await this.outbox.enqueue(item);
    }
  }

  /**
   * Validates dependency choices before anything is written:
   * - parents must exist and differ from the medicine itself,
   * - no cycles in same-day or course dependency graphs,
   * - a course prerequisite must actually end (otherwise the follow-up never starts).
   */
  private async validateDraftGraph(draft: WizardDraft, medId: string): Promise<void> {
    if (draft.scheduleType === 'SAME_DAY_DEPENDENT') {
      const parentId = draft.sameDayParentMedicationId;
      if (!parentId) throw new Error('Choose the medicine this dose follows.');
      if (parentId === medId) throw new Error('A medicine cannot depend on itself.');
      const parent = await this.medications.getById(parentId);
      if (!parent) throw new Error('The medicine this dose follows no longer exists.');
      if (await this.reachesViaDependency(parentId, medId, 'SAME_DAY_AFTER_TAKEN')) {
        throw new Error('These medicines would wait on each other. Choose a different parent.');
      }
    }
    if (draft.hasPrerequisiteCourse && draft.prerequisiteMedicationId) {
      const prereqId = draft.prerequisiteMedicationId;
      if (prereqId === medId) throw new Error('A medicine cannot start after itself.');
      const prereq = await this.medications.getById(prereqId);
      if (!prereq) throw new Error('The medicine to start after no longer exists.');
      if (prereq.courseType === 'ONGOING') {
        throw new Error('That medicine has no end date or dose count, so a follow-up would never start.');
      }
      if (await this.reachesViaDependency(prereqId, medId, 'AFTER_COURSE_COMPLETED')) {
        throw new Error('These courses would wait on each other. Choose a different medicine.');
      }
    }
  }

  /** True when `target` is reachable by walking *up* the parent chain starting from `startId`. */
  private async reachesViaDependency(
    startId: string,
    target: string,
    type: 'SAME_DAY_AFTER_TAKEN' | 'AFTER_COURSE_COMPLETED'
  ): Promise<boolean> {
    const seen = new Set<string>();
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === target) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const parents = await this.dependencies.getParents(id);
      for (const p of parents) {
        if (p.dependencyType === type) stack.push(p.parentMedicationId);
      }
    }
    return false;
  }

  /**
   * Creates (or edits) a medication, its schedule, and any dependencies in a single atomic
   * SQLite transaction. Editing replaces the schedule/dependencies and re-plans open future doses
   * while preserving history, the confirmed dose count and the course start.
   */
  async createMedicationWithSchedule(
    draft: WizardDraft,
    profileId?: string
  ): Promise<{ medication: Medication; schedule: Schedule }> {
    const activeProfile = profileId ? { id: profileId } : await this.profiles.getPrimary();
    if (!activeProfile) {
      throw new Error('No profile available to associate medication with.');
    }

    const tz = this.timeZone();
    const now = this.clock();
    const nowIso = now.toISOString();
    const today = localDateInZone(now, tz);
    const tomorrow = addDays(today, 1);
    const medId = draft.editingMedicationId || generateUUID();
    const schedId = generateUUID();

    const existing = draft.editingMedicationId ? await this.medications.getById(medId) : null;
    const existingSchedule = existing ? await this.schedules.getByMedicationId(medId) : null;

    await this.validateDraftGraph(draft, medId);

    let isQueued = false;
    if (draft.hasPrerequisiteCourse && draft.prerequisiteMedicationId) {
      const prereq = await this.medications.getById(draft.prerequisiteMedicationId);
      // A prerequisite that already completed means the follow-up can start straight away.
      isQueued = !!prereq && prereq.lifecycleStatus !== 'COMPLETED';
    }
    let lifecycleStatus: Medication['lifecycleStatus'];
    if (isQueued) lifecycleStatus = 'QUEUED_PHASE';
    else if (existing && existing.lifecycleStatus !== 'QUEUED_PHASE') lifecycleStatus = existing.lifecycleStatus;
    else lifecycleStatus = 'ACTIVE';

    const medication: Medication = {
      id: medId,
      profileId: existing?.profileId ?? activeProfile.id,
      name: draft.name.trim(),
      dosageText: draft.dosageText.trim() || `${draft.doseQuantity} ${draft.doseUnit}`,
      doseQuantity: draft.doseQuantity,
      doseUnit: draft.doseUnit,
      instructions: draft.instructions.trim() || undefined,
      lifecycleStatus,
      courseType: draft.courseType,
      courseStartAt: existing && existing.lifecycleStatus !== 'QUEUED_PHASE' ? existing.courseStartAt : draft.courseStartAt || nowIso,
      maxDurationDays: draft.courseType === 'FIXED_DAYS' ? draft.maxDurationDays : undefined,
      maxTotalDoses: draft.courseType === 'FIXED_DOSES' ? draft.maxTotalDoses : undefined,
      dosesTakenCount: existing?.dosesTakenCount ?? 0,
      trackStock: draft.trackStock,
      currentStock: draft.trackStock ? draft.currentStock : 0,
      lowStockThreshold: draft.lowStockThreshold || 5,
      version: existing?.version ?? 1,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    const schedule: Schedule = {
      id: schedId,
      medicationId: medId,
      scheduleType: draft.scheduleType,
      recurrenceType: draft.recurrenceType,
      startDate: existingSchedule?.startDate ?? today,
      timezoneId: tz,
      fixedTimes: draft.scheduleType === 'FIXED_TIMES' ? [...new Set(draft.fixedTimes)].sort() : [],
      activeWeekdays: draft.recurrenceType === 'SPECIFIC_DAYS' ? draft.activeWeekdays : [],
      intervalHours: draft.scheduleType === 'INTERVAL' ? draft.intervalHours : undefined,
      intervalFirstTime: draft.scheduleType === 'INTERVAL' ? draft.intervalFirstTime : undefined,
      cycleDaysOn: draft.recurrenceType === 'CYCLE' ? draft.cycleDaysOn : undefined,
      cycleDaysOff: draft.recurrenceType === 'CYCLE' ? draft.cycleDaysOff : undefined,
      cycleAnchorDate:
        draft.recurrenceType === 'CYCLE'
          ? draft.cycleAnchorDate || existingSchedule?.cycleAnchorDate || today
          : undefined,
      createdAt: existingSchedule?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    await this.connection.withTransaction(async () => {
      if (existing) {
        await this.medications.update(medication);
        await this.schedules.deleteByMedicationId(medId);
        await this.dependencies.deleteByChild(medId);
        await this.occurrences.deleteOpenForMedication(medId, nowIso);
      } else {
        await this.medications.create(medication);
      }

      await this.schedules.create(schedule);

      if (draft.scheduleType === 'SAME_DAY_DEPENDENT' && draft.sameDayParentMedicationId) {
        if (draft.sameDayFallbackPolicy === 'USE_FALLBACK_TIME' && !draft.sameDayFallbackTime) {
          throw new Error('Enter the fallback time from the prescription, or choose to skip this dose.');
        }
        await this.dependencies.create({
          id: generateUUID(),
          parentMedicationId: draft.sameDayParentMedicationId,
          childMedicationId: medId,
          dependencyType: 'SAME_DAY_AFTER_TAKEN',
          delayMinutes: draft.sameDayDelayMinutes || 30,
          phaseDelayHours: 0,
          fallbackPolicy: draft.sameDayFallbackPolicy || 'SKIP_CHILD',
          fallbackTime: draft.sameDayFallbackTime ?? null,
          createdAt: nowIso,
        });
      }

      if (draft.hasPrerequisiteCourse && draft.prerequisiteMedicationId) {
        await this.dependencies.create({
          id: generateUUID(),
          parentMedicationId: draft.prerequisiteMedicationId,
          childMedicationId: medId,
          dependencyType: 'AFTER_COURSE_COMPLETED',
          delayMinutes: 0,
          phaseDelayHours: draft.phaseDelayHours || 0,
          fallbackPolicy: null,
          fallbackTime: null,
          createdAt: nowIso,
        });
      }

      if (medication.lifecycleStatus === 'ACTIVE' && schedule.scheduleType !== 'SAME_DAY_DEPENDENT') {
        const planned = generateOccurrencesForRange({
          medication,
          schedule,
          fromLocalDate: today,
          toLocalDate: tomorrow,
        });
        // When editing, never resurrect doses that are already in the past
        await this.occurrences.batchInsert(existing ? planned.filter((o) => o.scheduledAtUtc >= nowIso) : planned);
      }
    });

    return { medication, schedule };
  }

  /**
   * Retrieves all dose occurrences for a given local date, joined with full medication details.
   */
  async getOccurrencesWithMedication(localDate: string): Promise<OccurrenceWithMedication[]> {
    const occurrences = await this.occurrences.getByDate(localDate);
    const results: OccurrenceWithMedication[] = [];
    // One lookup per medicine, not per dose
    const meds = new Map<string, Medication | null>();

    for (const occ of occurrences) {
      if (!meds.has(occ.medicationId)) meds.set(occ.medicationId, await this.medications.getById(occ.medicationId));
      const med = meds.get(occ.medicationId);
      if (med) {
        results.push({
          ...occ,
          medication: med,
        });
      }
    }

    return results;
  }

  /**
   * Materializes dose occurrences for all active medications over a given date range.
   */
  async materializeOccurrences(fromLocalDate: string, toLocalDate: string): Promise<void> {
    const activeMeds = await this.medications.getByLifecycle('ACTIVE');
    for (const med of activeMeds) {
      const sched = await this.schedules.getByMedicationId(med.id);
      if (sched && sched.scheduleType !== 'SAME_DAY_DEPENDENT') {
        const planned = generateOccurrencesForRange({
          medication: med,
          schedule: sched,
          fromLocalDate,
          toLocalDate,
        });
        await this.occurrences.batchInsert(planned);
      }
    }
  }

  /**
   * Completes `med` as of `completionInstantUtc`: retires its future doses, activates every queued
   * follow-up (1-to-many fan-out, honouring the phase delay), records the transition with its
   * five-minute undo window and queues a sync event. Must be called inside a transaction.
   */
  private async completeCourse(
    med: Medication,
    completionInstantUtc: string,
    tz: string
  ): Promise<{ transitionEventId: string; activatedNames: string[] }> {
    const transitionEventId = generateUUID();
    const courseChildDeps = (await this.dependencies.getChildren(med.id)).filter(
      (d) => d.dependencyType === 'AFTER_COURSE_COMPLETED'
    );
    const queuedChildren = (await this.medications.getByLifecycle('QUEUED_PHASE')).filter((qc) =>
      courseChildDeps.some((cd) => cd.childMedicationId === qc.id)
    );

    const fanout = completeCourseAndFanOut({
      parentMedication: med,
      queuedChildren,
      dependencyLinks: courseChildDeps.map((cd) => ({
        parentMedicationId: cd.parentMedicationId,
        childMedicationId: cd.childMedicationId,
        phaseDelayHours: cd.phaseDelayHours,
      })),
      completionTimestampUtc: completionInstantUtc,
      transitionEventId,
    });

    await this.medications.updateLifecycle(med.id, 'COMPLETED');
    // The prerequisite must never ring again
    await this.occurrences.deleteOpenForMedicationAll(med.id);

    const nowIso = new Date().toISOString();
    for (const child of fanout.activatedChildren) {
      await this.medications.update(child);
      // Re-anchor the child's calendar to the day its course actually starts
      const startLocalDate = localDateInZone(child.courseStartAt, tz);
      await this.connection.run(
        `UPDATE medication_schedules
           SET start_date = ?,
               cycle_anchor_date = CASE WHEN recurrence_type = 'CYCLE' THEN ? ELSE cycle_anchor_date END,
               updated_at = ?
         WHERE medication_id = ?;`,
        [startLocalDate, startLocalDate, nowIso, child.id]
      );
    }

    await this.courseTransitions.recordTransition(fanout.transitionEvent);

    await this.enqueueEvent({
      eventId: generateUUID(),
      eventType: 'COURSE_TRANSITION_COMPLETED',
      aggregateId: med.id,
      payloadJson: JSON.stringify({
        transitionEventId,
        sourceCourseId: med.id,
        activatedMedicationIds: fanout.activatedChildren.map((c) => c.id),
        completedAt: completionInstantUtc,
      }),
      createdAt: nowIso,
    });

    return { transitionEventId, activatedNames: fanout.activatedChildren.map((c) => c.name) };
  }

  /**
   * Calendar-day completion (SRS 3.2.2): FIXED_DAYS courses retire at the end of day N regardless of
   * missed doses, even if the app was closed or the phone was off at the boundary. Safe to call
   * repeatedly (app launch/resume, after every action, on reconciliation).
   */
  async completeDueCalendarCourses(now: Date = this.clock()): Promise<
    Array<{ medicationId: string; transitionEventId: string; activatedNames: string[] }>
  > {
    const tz = this.timeZone();
    const results: Array<{ medicationId: string; transitionEventId: string; activatedNames: string[] }> = [];
    const activeMeds = await this.medications.getByLifecycle('ACTIVE');
    for (const med of activeMeds) {
      if (med.courseType !== 'FIXED_DAYS') continue;
      const boundary = fixedDaysCompletionInstant(med, tz);
      if (!boundary || new Date(boundary).getTime() > now.getTime()) continue;
      await this.connection.withTransaction(async () => {
        const fresh = await this.medications.getById(med.id);
        if (!fresh || fresh.lifecycleStatus !== 'ACTIVE') return;
        const res = await this.completeCourse(fresh, boundary, tz);
        results.push({ medicationId: med.id, ...res });
      });
    }
    if (results.length > 0) {
      const today = localDateInZone(now, tz);
      await this.materializeOccurrences(today, addDays(today, 1));
    }
    return results;
  }

  /**
   * Predicts the doses of medicines that are still waiting for a CALENDAR-DAY course to end.
   *
   * A FIXED_DAYS course ends at a known instant, so the start of every follow-up (and of follow-ups of
   * follow-ups) is known in advance. Their alarms can therefore be armed before the transition
   * happens, which is what makes "Medicine A for 4 days, then B, C and D" ring on Day 5 even if the
   * app was never opened in between (SRS 3.2 / 6 "Offline Determinism"). The predicted occurrence ids
   * are identical to the ones created when the course really transitions, so the alarm resolves to a
   * real dose as soon as the app runs. Dose-count courses cannot be predicted and are not included.
   */
  async projectQueuedOccurrences(
    fromLocalDate: string,
    toLocalDate: string
  ): Promise<Array<{ medication: Medication; occurrences: ReturnType<typeof generateOccurrencesForRange> }>> {
    const tz = this.timeZone();
    const queued = await this.medications.getByLifecycle('QUEUED_PHASE');
    if (queued.length === 0) return [];

    const startCache = new Map<string, string | null>();
    /** Instant at which `med`'s course is expected to complete, or null if unknown. */
    const completionOf = async (med: Medication, depth: number): Promise<string | null> => {
      if (depth > 8 || med.courseType !== 'FIXED_DAYS' || !med.maxDurationDays) return null;
      if (med.lifecycleStatus === 'ACTIVE') return fixedDaysCompletionInstant(med, tz);
      if (med.lifecycleStatus !== 'QUEUED_PHASE') return null;
      const start = await startOf(med, depth + 1);
      return start ? fixedDaysCompletionInstant({ ...med, courseStartAt: start }, tz) : null;
    };
    /** Instant at which a queued medicine is expected to start, or null if unknown. */
    const startOf = async (med: Medication, depth: number): Promise<string | null> => {
      if (startCache.has(med.id)) return startCache.get(med.id)!;
      let result: string | null = null;
      const dep = (await this.dependencies.getParents(med.id)).find((d) => d.dependencyType === 'AFTER_COURSE_COMPLETED');
      const parent = dep ? await this.medications.getById(dep.parentMedicationId) : null;
      if (dep && parent) {
        const done = await completionOf(parent, depth);
        if (done) result = new Date(new Date(done).getTime() + (dep.phaseDelayHours || 0) * 3600 * 1000).toISOString();
      }
      startCache.set(med.id, result);
      return result;
    };

    const out: Array<{ medication: Medication; occurrences: ReturnType<typeof generateOccurrencesForRange> }> = [];
    for (const med of queued) {
      const start = await startOf(med, 0);
      if (!start) continue;
      const sched = await this.schedules.getByMedicationId(med.id);
      if (!sched || sched.scheduleType === 'SAME_DAY_DEPENDENT') continue;
      const startLocalDate = localDateInZone(start, tz);
      if (startLocalDate > toLocalDate) continue;
      const occurrences = generateOccurrencesForRange({
        medication: { ...med, lifecycleStatus: 'ACTIVE', courseStartAt: start },
        // Mirrors what completeCourse() does to the schedule when the course really starts
        schedule: {
          ...sched,
          startDate: startLocalDate,
          cycleAnchorDate: sched.recurrenceType === 'CYCLE' ? startLocalDate : sched.cycleAnchorDate,
        },
        fromLocalDate: startLocalDate > fromLocalDate ? startLocalDate : fromLocalDate,
        toLocalDate,
      });
      if (occurrences.length > 0) out.push({ medication: med, occurrences });
    }
    return out;
  }

  /**
   * Marks doses that nobody acknowledged within 30 minutes as "not confirmed" and queues the
   * caregiver event (SRS 3.4.3). Wording is deliberately neutral: the app cannot know whether the
   * medicine was taken. A late Taken is still accepted afterwards.
   */
  async markUnconfirmedDoses(now: Date = this.clock()): Promise<DoseOccurrenceRow[]> {
    const overdue = await this.occurrences.getOpenOverdue(now.toISOString(), UNCONFIRMED_AFTER_MINUTES * 60 * 1000);
    const flagged: DoseOccurrenceRow[] = [];
    for (const occ of overdue) {
      const med = await this.medications.getById(occ.medicationId);
      if (!med || med.lifecycleStatus !== 'ACTIVE') continue;
      await this.connection.withTransaction(async () => {
        const eventId = generateUUID();
        const nowIso = now.toISOString();
        await this.occurrences.updateState(occ.id, 'UNCONFIRMED', nowIso);
        await this.doseLogs.create({
          id: generateUUID(),
          medicationId: occ.medicationId,
          doseOccurrenceId: occ.id,
          scheduledAt: occ.scheduledAtUtc,
          actionTaken: 'UNCONFIRMED',
          actionTimestamp: nowIso,
          syncedToCloud: false,
          eventId,
        });
        await this.enqueueEvent({
          eventId,
          eventType: 'DOSE_NOT_CONFIRMED',
          aggregateId: occ.medicationId,
          payloadJson: JSON.stringify({
            medicationId: occ.medicationId,
            occurrenceId: occ.id,
            action: 'UNCONFIRMED',
            scheduledAtUtc: occ.scheduledAtUtc,
            actionTimestampUtc: nowIso,
            timezoneId: occ.timezoneId,
          }),
          createdAt: nowIso,
        });
      });
      flagged.push(occ);
    }
    return flagged;
  }

  /**
   * Executes a dose action (TAKEN, SKIPPED, SNOOZED) atomically in a single SQLite transaction:
   * 1. Ignores replays for an already-handled occurrence (idempotent: no double stock/count)
   * 2. Updates occurrence state and writes the immutable dose log using the occurrence's real scheduled time
   * 3. Decrements stock and increments course dose count (on TAKEN only)
   * 4. Schedules same-day dependent children from the ACTUAL taken time (never on snooze)
   * 5. Evaluates course completion and triggers 1-to-many fan-out with a 5-minute undo window
   * 6. Enqueues an idempotent outbox event for cloud sync
   *
   * `scheduledAtUtc` is accepted for backwards compatibility but the occurrence row is authoritative.
   */
  async recordDoseAction(params: {
    medicationId: string;
    occurrenceId: string;
    action: DoseEventType;
    scheduledAtUtc?: string;
    actionTimestampUtc: string;
    timezoneId?: string;
    fallbackPolicy?: 'SKIP_CHILD' | 'USE_FALLBACK_TIME';
    fallbackTime?: string;
  }): Promise<DoseActionResult> {
    const { medicationId, occurrenceId, action, actionTimestampUtc, fallbackPolicy, fallbackTime } = params;

    const result: DoseActionResult = { applied: false, courseCompleted: false, childOccurrenceScheduled: false };

    await this.connection.withTransaction(async () => {
      const med = await this.medications.getById(medicationId);
      if (!med) throw new Error(`Medication not found: ${medicationId}`);

      const occ = await this.occurrences.getById(occurrenceId);
      if (!occ) throw new Error(`Dose occurrence not found: ${occurrenceId}`);
      if (occ.medicationId !== medicationId) throw new Error('Dose occurrence does not belong to this medication.');

      // Idempotency: a handled dose, or one for a medicine that is no longer active, changes nothing.
      if (occ.state === 'TAKEN' || occ.state === 'SKIPPED' || med.lifecycleStatus !== 'ACTIVE') {
        return;
      }

      const tz = occ.timezoneId || params.timezoneId || this.timeZone();
      const scheduledAtUtc = occ.scheduledAtUtc;
      const eventId = generateUUID();
      result.applied = true;

      const targetState = action === 'TAKEN' ? 'TAKEN' : action === 'SKIPPED' ? 'SKIPPED' : 'SCHEDULED';
      if (action !== 'SNOOZED') {
        await this.occurrences.updateState(occurrenceId, targetState as any, actionTimestampUtc);
      }

      await this.doseLogs.create({
        id: generateUUID(),
        medicationId,
        doseOccurrenceId: occurrenceId,
        scheduledAt: scheduledAtUtc,
        actionTaken: action,
        actionTimestamp: actionTimestampUtc,
        syncedToCloud: false,
        eventId,
      });

      if (action === 'TAKEN') {
        const { dosesTakenCount, newStock } = await this.medications.recordDoseTaken(medicationId, med.doseQuantity);
        med.dosesTakenCount = dosesTakenCount;
        med.currentStock = newStock;

        // Same-day dependent doses start from the actual taken time
        const childDeps = (await this.dependencies.getChildren(medicationId)).filter(
          (d) => d.dependencyType === 'SAME_DAY_AFTER_TAKEN'
        );
        for (const dep of childDeps) {
          const child = await this.medications.getById(dep.childMedicationId);
          if (!child || child.lifecycleStatus !== 'ACTIVE') continue;
          const evalResult = evaluateDependentDose({
            parentAction: 'TAKEN',
            parentActionTimestamp: actionTimestampUtc,
            parentScheduledDate: occ.scheduledLocalDate,
            delayMinutes: dep.delayMinutes,
            timezoneId: tz,
          });
          if (evalResult.action === 'SCHEDULE' && evalResult.scheduledAtUtc) {
            await this.insertDependentOccurrence(dep.childMedicationId, occurrenceId, evalResult.scheduledAtUtc, tz);
            result.childOccurrenceScheduled = true;
          }
        }

        // Course completion (dose count, or calendar day reached by the time of this dose)
        const currentLocalDate = localDateInZone(actionTimestampUtc, tz);
        if (isCourseComplete({ medication: med, currentLocalDate, timezoneId: tz })) {
          const { transitionEventId, activatedNames } = await this.completeCourse(med, actionTimestampUtc, tz);
          result.courseCompleted = true;
          result.transitionEventId = transitionEventId;
          result.activatedMedicationNames = activatedNames;
        } else if (med.trackStock) {
          const schedule = await this.schedules.getByMedicationId(medicationId);
          if (schedule) {
            const forecast = forecastMedicationStock({ medication: med, schedule, currentLocalDate });
            const flagKey = `low_stock_notified_${medicationId}`;
            if (forecast.isLowStock) {
              if (!(await this.settings.getBoolean(flagKey, false))) {
                await this.settings.setBoolean(flagKey, true);
                result.lowStock = {
                  medicationId,
                  name: med.name,
                  daysRemaining: Number.isFinite(forecast.daysRemaining) ? forecast.daysRemaining : 0,
                  currentStock: med.currentStock,
                };
              }
            } else {
              await this.settings.setBoolean(flagKey, false);
            }
          }
        }
      } else if (action === 'SKIPPED') {
        const childDeps = (await this.dependencies.getChildren(medicationId)).filter(
          (d) => d.dependencyType === 'SAME_DAY_AFTER_TAKEN'
        );
        for (const dep of childDeps) {
          const child = await this.medications.getById(dep.childMedicationId);
          if (!child || child.lifecycleStatus !== 'ACTIVE') continue;
          const evalResult = evaluateDependentDose({
            parentAction: 'SKIPPED',
            parentActionTimestamp: actionTimestampUtc,
            parentScheduledDate: occ.scheduledLocalDate,
            delayMinutes: dep.delayMinutes,
            fallbackPolicy: fallbackPolicy ?? dep.fallbackPolicy,
            fallbackTime: fallbackTime ?? dep.fallbackTime,
            timezoneId: tz,
          });
          if (evalResult.action === 'SCHEDULE' && evalResult.scheduledAtUtc) {
            await this.insertDependentOccurrence(dep.childMedicationId, occurrenceId, evalResult.scheduledAtUtc, tz);
            result.childOccurrenceScheduled = true;
          }
        }
      } else if (action === 'SNOOZED') {
        // Snooze never starts a dependent countdown and never touches stock or course count.
        const snoozeAt = new Date(new Date(actionTimestampUtc).getTime() + SNOOZE_MINUTES * 60 * 1000);
        await this.occurrences.snooze(occurrenceId, snoozeAt.toISOString());
      }

      const eventType = action === 'TAKEN' ? 'DOSE_TAKEN' : action === 'SKIPPED' ? 'DOSE_SKIPPED' : 'DOSE_SNOOZED';
      await this.enqueueEvent({
        eventId,
        eventType,
        aggregateId: medicationId,
        payloadJson: JSON.stringify({
          medicationId,
          occurrenceId,
          action,
          scheduledAtUtc,
          actionTimestampUtc,
          timezoneId: tz,
        }),
        createdAt: actionTimestampUtc,
      });
    });

    return result;
  }

  private async insertDependentOccurrence(
    childMedicationId: string,
    parentOccurrenceId: string,
    scheduledAtUtc: string,
    tz: string
  ): Promise<void> {
    const parts = utcToZonedParts(scheduledAtUtc, tz);
    await this.occurrences.batchInsert([
      {
        // Deterministic so a replayed parent action can never create a second child dose
        occurrenceId: `${childMedicationId}_after_${parentOccurrenceId}`,
        medicationId: childMedicationId,
        scheduledAtUtc,
        scheduledLocalDate: parts.date,
        scheduledLocalTime: parts.time,
        timezoneId: tz,
      },
    ]);
  }

  /**
   * Reverses course completion within the 5-minute undo window
   */
  async undoCourseCompletion(params: {
    transitionEventId: string;
    courseId: string;
    currentTimestampUtc: string;
  }): Promise<{ success: boolean; reason?: string }> {
    const { courseId, currentTimestampUtc } = params;

    const transitionEvent = await this.courseTransitions.getLatestForCourse(courseId);
    if (!transitionEvent) {
      return { success: false, reason: 'No active transition event found' };
    }

    const parent = await this.medications.getById(courseId);
    if (!parent) {
      return { success: false, reason: 'Course not found' };
    }

    const activatedChildren: any[] = [];
    for (const childId of transitionEvent.activatedMedicationIds) {
      const child = await this.medications.getById(childId);
      if (child) activatedChildren.push(child);
    }

    const undoResult = undoCourseTransition({
      transitionEvent,
      currentTimestampUtc,
      currentParent: parent,
      currentChildren: activatedChildren,
    });

    if (!undoResult.success || !undoResult.restoredParent) {
      return { success: false, reason: undoResult.reason };
    }

    await this.connection.withTransaction(async () => {
      let restoredParent = undoResult.restoredParent!;

      // The final dose was an accidental Taken: put it back so the dose can be handled again.
      let reopenedOccurrenceId: string | null = null;
      if (restoredParent.courseType === 'FIXED_DOSES') {
        const lastTaken = await this.connection.get<any>(
          `SELECT * FROM dose_logs WHERE med_id = ? AND action_taken = 'TAKEN' ORDER BY action_timestamp DESC LIMIT 1;`,
          [courseId]
        );
        if (lastTaken && lastTaken.action_timestamp === transitionEvent.transitionTimestamp && lastTaken.dose_occurrence_id) {
          reopenedOccurrenceId = lastTaken.dose_occurrence_id;
          await this.connection.run(
            `UPDATE dose_occurrences SET state = 'SCHEDULED', handled_at = NULL, snoozed_until = NULL, updated_at = ? WHERE id = ?;`,
            [currentTimestampUtc, reopenedOccurrenceId]
          );
          restoredParent = {
            ...restoredParent,
            dosesTakenCount: Math.max(0, restoredParent.dosesTakenCount - 1),
            currentStock: restoredParent.trackStock
              ? restoredParent.currentStock + restoredParent.doseQuantity
              : restoredParent.currentStock,
          };
        }
      }

      await this.medications.update(restoredParent);
      for (const child of undoResult.restoredChildren ?? []) {
        await this.medications.update(child);
        // Follow-ups return to waiting: they must not keep any pending alarms
        await this.occurrences.deleteOpenForMedicationAll(child.id);
      }
      await this.courseTransitions.markUndone(transitionEvent.id, currentTimestampUtc);

      // Enqueue compensating event to outbox
      await this.enqueueEvent({
        eventId: generateUUID(),
        eventType: 'COURSE_TRANSITION_UNDONE',
        aggregateId: courseId,
        payloadJson: JSON.stringify({
          transitionEventId: transitionEvent.id,
          sourceCourseId: courseId,
          undoneAt: currentTimestampUtc,
          reopenedOccurrenceId,
        }),
        createdAt: currentTimestampUtc,
      });
    });

    return { success: true };
  }

  /**
   * Creates the local personal profile on first run. No medicines or sample data are ever seeded:
   * the user starts with a clean slate.
   */
  async ensurePrimaryProfile(): Promise<void> {
    const existing = await this.profiles.getPrimary();
    if (existing) return;

    const profileId = generateUUID();
    const nowIso = new Date().toISOString();
    const profile = {
      id: profileId,
      displayName: 'Me',
      profileType: 'PERSONAL' as const,
      timezoneId: this.timeZone(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.profiles.create(profile);
  }

  /**
   * Clears all user medications, schedules, occurrences, dependencies, and logs.
   * Used for reset to clean state.
   */
  async clearAllUserData(): Promise<void> {
    await this.connection.withTransaction(async (tx) => {
      await tx.run('DELETE FROM dose_occurrences');
      await tx.run('DELETE FROM dependencies');
      await tx.run('DELETE FROM schedules');
      await tx.run('DELETE FROM medications');
      await tx.run('DELETE FROM dose_logs');
      await tx.run('DELETE FROM transition_events');
      await tx.run('DELETE FROM sync_outbox');
      await tx.run('DELETE FROM device_settings WHERE key LIKE \'low_stock_notified_%\';');
    });
  }
}
