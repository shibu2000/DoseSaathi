import type { PlanMedication, PlanSnapshotV2, DevicePlanReport } from '@medchain/contracts';
import { PlanSnapshotV2Schema } from '@medchain/contracts';
import type { AppDatabase, WizardDraft } from '../database';
import { DEFAULT_WIZARD_DRAFT } from '../database';

export class PlanRejectedError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PlanRejectedError';
  }
}

export type ApplyResult =
  | { status: 'APPLIED'; appliedMedicationIds: string[]; removedMedicationIds: string[] }
  | { status: 'ALREADY_APPLIED' }
  | { status: 'REJECTED'; code: string; message: string };

/** Plan medicine -> the same draft the wizard produces, so remote and local share one validated path. */
export function planMedicationToDraft(m: PlanMedication, isExisting: boolean): WizardDraft {
  const s = m.schedule;
  return {
    ...DEFAULT_WIZARD_DRAFT,
    name: m.name,
    dosageText: m.dosageText,
    doseQuantity: m.doseQuantity,
    doseUnit: m.doseUnit,
    instructions: m.instructions ?? '',
    trackStock: m.trackStock,
    currentStock: m.initialStock ?? 0,
    lowStockThreshold: m.lowStockThreshold,
    scheduleType: s.scheduleType,
    recurrenceType: s.recurrenceType,
    fixedTimes: s.fixedTimes,
    activeWeekdays: s.activeWeekdays,
    intervalHours: s.intervalHours ?? DEFAULT_WIZARD_DRAFT.intervalHours,
    intervalFirstTime: s.intervalFirstTime ?? DEFAULT_WIZARD_DRAFT.intervalFirstTime,
    cycleDaysOn: s.cycleDaysOn ?? DEFAULT_WIZARD_DRAFT.cycleDaysOn,
    cycleDaysOff: s.cycleDaysOff ?? DEFAULT_WIZARD_DRAFT.cycleDaysOff,
    cycleAnchorDate: s.cycleAnchorDate,
    sameDayParentMedicationId: m.sameDay?.parentMedicationId,
    sameDayDelayMinutes: m.sameDay?.delayMinutes ?? DEFAULT_WIZARD_DRAFT.sameDayDelayMinutes,
    sameDayFallbackPolicy: m.sameDay?.fallbackPolicy,
    sameDayFallbackTime: m.sameDay?.fallbackTime,
    courseType: m.courseType,
    maxDurationDays: m.maxDurationDays ?? undefined,
    maxTotalDoses: m.maxTotalDoses ?? undefined,
    hasPrerequisiteCourse: !!m.startsAfter,
    prerequisiteMedicationId: m.startsAfter?.prerequisiteMedicationId,
    phaseDelayHours: m.startsAfter?.phaseDelayHours ?? 0,
    currentStep: 4,
    editingMedicationId: m.id,
    // `isExisting` is informational: createMedicationWithSchedule detects it from the database.
    ...(isExisting ? {} : {}),
  };
}

/** Canonical JSON used to compare two plan medicines ignoring undefined/null/empty differences. */
function normalizePlan(m: PlanMedication): string {
  return JSON.stringify(m, (_k, v) => (v === undefined || v === null || (Array.isArray(v) && v.length === 0) ? undefined : v), 0)
    .split('')
    .join('');
}

/** Orders medicines so every dependency parent is created before its children; throws on cycles. */
function orderByDependencies(meds: PlanMedication[]): PlanMedication[] {
  const byId = new Map(meds.map((m) => [m.id, m]));
  const ordered: PlanMedication[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: PlanMedication) => {
    const st = state.get(m.id);
    if (st === 'done') return;
    if (st === 'visiting') throw new PlanRejectedError('DEPENDENCY_CYCLE', 'The plan contains medicines that wait on each other.');
    state.set(m.id, 'visiting');
    for (const parentId of [m.sameDay?.parentMedicationId, m.startsAfter?.prerequisiteMedicationId]) {
      if (parentId && byId.has(parentId)) visit(byId.get(parentId)!);
    }
    state.set(m.id, 'done');
    ordered.push(m);
  };
  meds.forEach(visit);
  return ordered;
}

/**
 * Applies a caregiver plan snapshot to the local database in ONE transaction.
 *
 * - Caregiver-authored fields (name, dose, schedule, course rule, dependencies) are applied.
 * - Device-owned progress (confirmed dose count, lifecycle, course start, stock on hand) is preserved.
 * - Any failure rolls the whole plan back and is reported as REJECTED; the existing plan stays intact.
 * - A command id already applied is a no-op, so repeated pushes/fetches never apply twice.
 * - Caregivers can only change or remove medicines that a caregiver created: the patient's own
 *   personal medicines are never touched.
 */
export async function applyPlanSnapshot(
  db: AppDatabase,
  params: { commandId: string; relationshipId: string; planVersion: number; snapshot: unknown }
): Promise<ApplyResult> {
  const { commandId, relationshipId, planVersion } = params;
  const conn = db.connection;
  const nowIso = db.clock().toISOString();

  const prior = await conn.get<{ status: string }>(`SELECT status FROM applied_commands WHERE command_id = ?;`, [commandId]);
  if (prior) return { status: 'ALREADY_APPLIED' };

  const reject = async (code: string, message: string): Promise<ApplyResult> => {
    await conn.run(
      `INSERT OR REPLACE INTO applied_commands (command_id, relationship_id, plan_version, status, reason_code, applied_at)
       VALUES (?, ?, ?, 'REJECTED', ?, ?);`,
      [commandId, relationshipId, planVersion, code, nowIso]
    );
    return { status: 'REJECTED', code, message };
  };

  const parsed = PlanSnapshotV2Schema.safeParse(params.snapshot);
  if (!parsed.success) return reject('INVALID_PLAN', 'The plan could not be understood by this app version.');
  const snapshot: PlanSnapshotV2 = parsed.data;

  try {
    const result = await conn.withTransaction(async () => {
      const profile = await db.profiles.getPrimary();
      if (!profile) throw new PlanRejectedError('NO_PROFILE', 'This device has no profile yet.');

      const ordered = orderByDependencies(snapshot.medications);
      const touched: string[] = [];
      // A caregiver's full snapshot also echoes the patient's own medicines (taken from the device report).
      // Those are accepted only when unchanged; any real change to them is rejected.
      const localReport = await buildDevicePlanReport(db);
      const localById = new Map(localReport.medications.map((m) => [m.id, m]));

      for (const med of ordered) {
        const existing = await db.medications.getById(med.id);
        if (existing) {
          const remote = await conn.get(`SELECT 1 AS x FROM remote_medications WHERE medication_id = ?;`, [med.id]);
          if (!remote) {
            const local = localById.get(med.id);
            if (local && normalizePlan(local) === normalizePlan(med)) continue; // unchanged echo: no-op
            throw new PlanRejectedError('NOT_CAREGIVER_MEDICINE', 'The plan tried to change a medicine that was added on this phone.');
          }
        }
        const draft = planMedicationToDraft(med, !!existing);
        // For an existing medicine the device keeps its own stock count unless stock tracking is newly enabled.
        if (existing && existing.trackStock && med.trackStock) draft.currentStock = existing.currentStock;
        else if (existing && med.trackStock && med.initialStock === undefined) draft.currentStock = existing.currentStock;
        try {
          await db.createMedicationWithSchedule(draft, profile.id);
        } catch (err: any) {
          throw new PlanRejectedError('INVALID_MEDICINE', `${med.name}: ${err?.message ?? 'could not be applied'}`);
        }
        await conn.run(
          `INSERT INTO remote_medications (medication_id, relationship_id, plan_version, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(medication_id) DO UPDATE SET relationship_id = excluded.relationship_id,
             plan_version = excluded.plan_version, updated_at = excluded.updated_at;`,
          [med.id, relationshipId, planVersion, nowIso]
        );
        touched.push(med.id);
      }

      const removed: string[] = [];
      for (const id of snapshot.removedMedicationIds) {
        const remote = await conn.get(`SELECT 1 AS x FROM remote_medications WHERE medication_id = ? AND relationship_id = ?;`, [id, relationshipId]);
        if (!remote) {
          const own = await db.medications.getById(id);
          if (own) throw new PlanRejectedError('NOT_CAREGIVER_MEDICINE', 'The plan tried to remove a medicine that was added on this phone.');
          continue; // already gone
        }
        await db.medications.updateLifecycle(id, 'COMPLETED');
        await db.occurrences.deleteOpenForMedicationAll(id);
        removed.push(id);
      }

      await conn.run(
        `INSERT INTO applied_commands (command_id, relationship_id, plan_version, status, reason_code, applied_at)
         VALUES (?, ?, ?, 'APPLIED', NULL, ?);`,
        [commandId, relationshipId, planVersion, nowIso]
      );
      return { touched, removed };
    });
    return { status: 'APPLIED', appliedMedicationIds: result.touched, removedMedicationIds: result.removed };
  } catch (err: any) {
    if (err instanceof PlanRejectedError) return reject(err.code, err.message);
    return reject('APPLY_FAILED', 'The plan could not be saved on this phone.');
  }
}

/** The device's authoritative plan + progress, uploaded so caregivers see real state. */
export async function buildDevicePlanReport(db: AppDatabase): Promise<DevicePlanReport> {
  const meds = await db.medications.getAll();
  const medications: PlanMedication[] = [];
  const status: DevicePlanReport['status'] = [];

  for (const m of meds) {
    const sched = await db.schedules.getByMedicationId(m.id);
    if (!sched) continue;
    const parents = await db.dependencies.getParents(m.id);
    const sameDay = parents.find((p) => p.dependencyType === 'SAME_DAY_AFTER_TAKEN');
    const course = parents.find((p) => p.dependencyType === 'AFTER_COURSE_COMPLETED');
    medications.push({
      id: m.id,
      name: m.name,
      dosageText: m.dosageText,
      doseQuantity: m.doseQuantity,
      doseUnit: m.doseUnit,
      instructions: m.instructions,
      courseType: m.courseType,
      maxDurationDays: m.maxDurationDays ?? null,
      maxTotalDoses: m.maxTotalDoses ?? null,
      trackStock: m.trackStock,
      lowStockThreshold: m.lowStockThreshold,
      schedule: {
        scheduleType: sched.scheduleType,
        recurrenceType: sched.recurrenceType,
        fixedTimes: sched.fixedTimes,
        activeWeekdays: sched.activeWeekdays,
        intervalHours: sched.intervalHours ?? undefined,
        intervalFirstTime: sched.intervalFirstTime ?? undefined,
        cycleDaysOn: sched.cycleDaysOn ?? undefined,
        cycleDaysOff: sched.cycleDaysOff ?? undefined,
        cycleAnchorDate: sched.cycleAnchorDate ?? undefined,
      },
      sameDay: sameDay
        ? {
            parentMedicationId: sameDay.parentMedicationId,
            delayMinutes: sameDay.delayMinutes,
            fallbackPolicy: (sameDay.fallbackPolicy as any) ?? undefined,
            fallbackTime: sameDay.fallbackTime ?? undefined,
          }
        : undefined,
      startsAfter: course
        ? { prerequisiteMedicationId: course.parentMedicationId, phaseDelayHours: course.phaseDelayHours }
        : undefined,
    });
    status.push({
      medicationId: m.id,
      lifecycleStatus: m.lifecycleStatus,
      dosesTakenCount: m.dosesTakenCount,
      currentStock: m.trackStock ? m.currentStock : undefined,
      courseStartAt: m.courseStartAt,
    });
  }
  return { schemaVersion: 2, medications, status };
}
