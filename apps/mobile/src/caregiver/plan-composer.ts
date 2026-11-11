import {
  PlanSnapshotV2Schema,
  MAX_PLAN_SNAPSHOT_BYTES,
  type PlanMedication,
  type PlanSnapshotV2,
  type DevicePlanReport,
  type DeviceMedicationStatus,
} from '@medchain/contracts';
import type { WizardDraft } from '../database/repositories/draft-repository';

/**
 * Pure helpers that turn a caregiver's wizard drafts into a prescription (PlanSnapshotV2).
 * Nothing here touches the network or SQLite so it is fully unit-testable.
 */

export { MAX_PLAN_SNAPSHOT_BYTES };

export interface PlanBase {
  medications: PlanMedication[];
  removedMedicationIds: string[];
  /** Per-medicine progress reported by the phone (never sent back as part of the plan). */
  status: DeviceMedicationStatus[];
}

/** The shape of GET /relationships/:id/medications that the composer needs. */
export interface PlanStateLike {
  isApplied?: boolean;
  planSnapshot: PlanSnapshotV2 | null;
  deviceReport?: (DevicePlanReport & Record<string, unknown>) | null;
}

/**
 * Base for a new edit: the latest server prescription. If the phone never published one,
 * the phone's reported medicines (status stripped, since status is not part of a prescription).
 */
export function baseFromPlanState(plan: PlanStateLike): PlanBase {
  const status = plan.deviceReport?.status ?? [];
  if (plan.planSnapshot) {
    return {
      medications: plan.planSnapshot.medications.map(clonePlanMedication),
      // Removals of a command the phone has not applied yet must be carried forward or they would be lost.
      removedMedicationIds: plan.isApplied === false ? [...plan.planSnapshot.removedMedicationIds] : [],
      status,
    };
  }
  return {
    medications: (plan.deviceReport?.medications ?? []).map(clonePlanMedication),
    removedMedicationIds: [],
    status,
  };
}

export function clonePlanMedication(m: PlanMedication): PlanMedication {
  return JSON.parse(JSON.stringify(m)) as PlanMedication;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Inverse of `planMedicationToDraft` (src/sync/plan-applier.ts). Only fields relevant to the schedule type are kept. */
export function draftToPlanMedication(draft: WizardDraft, id: string): PlanMedication {
  const qty = draft.doseQuantity > 0 ? draft.doseQuantity : 1;
  const unit = draft.doseUnit?.trim() || 'tablet';
  const isFixed = draft.scheduleType === 'FIXED_TIMES';
  const isInterval = draft.scheduleType === 'INTERVAL';
  const isSameDay = draft.scheduleType === 'SAME_DAY_DEPENDENT';
  const isCycle = draft.recurrenceType === 'CYCLE';
  const isSpecific = draft.recurrenceType === 'SPECIFIC_DAYS';

  const med: PlanMedication = {
    id,
    name: draft.name.trim(),
    dosageText: draft.dosageText.trim() || `${qty} ${unit}`,
    doseQuantity: qty,
    doseUnit: unit,
    courseType: draft.courseType,
    trackStock: draft.trackStock,
    lowStockThreshold: draft.lowStockThreshold >= 0 ? draft.lowStockThreshold : 5,
    schedule: {
      scheduleType: draft.scheduleType,
      recurrenceType: draft.recurrenceType,
      fixedTimes: isFixed ? [...new Set(draft.fixedTimes)].sort() : [],
      activeWeekdays: isSpecific ? [...draft.activeWeekdays].sort((a, b) => a - b) : [],
    },
  };
  const instructions = draft.instructions?.trim();
  if (instructions) med.instructions = instructions;
  if (draft.courseType === 'FIXED_DAYS' && draft.maxDurationDays) med.maxDurationDays = draft.maxDurationDays;
  if (draft.courseType === 'FIXED_DOSES' && draft.maxTotalDoses) med.maxTotalDoses = draft.maxTotalDoses;
  if (draft.trackStock) med.initialStock = draft.currentStock;
  if (isInterval) {
    med.schedule.intervalHours = draft.intervalHours;
    med.schedule.intervalFirstTime = draft.intervalFirstTime;
  }
  if (isCycle) {
    med.schedule.cycleDaysOn = draft.cycleDaysOn;
    med.schedule.cycleDaysOff = draft.cycleDaysOff;
    if (draft.cycleAnchorDate) med.schedule.cycleAnchorDate = draft.cycleAnchorDate;
  }
  if (isSameDay && draft.sameDayParentMedicationId) {
    med.sameDay = {
      parentMedicationId: draft.sameDayParentMedicationId,
      delayMinutes: draft.sameDayDelayMinutes,
      ...(draft.sameDayFallbackPolicy ? { fallbackPolicy: draft.sameDayFallbackPolicy } : {}),
      ...(draft.sameDayFallbackPolicy === 'USE_FALLBACK_TIME' && draft.sameDayFallbackTime
        ? { fallbackTime: draft.sameDayFallbackTime }
        : {}),
    };
  }
  if (draft.hasPrerequisiteCourse && draft.prerequisiteMedicationId) {
    med.startsAfter = {
      prerequisiteMedicationId: draft.prerequisiteMedicationId,
      phaseDelayHours: Math.max(0, Math.round(draft.phaseDelayHours || 0)),
    };
  }
  return med;
}

/** Insert or replace by id. Existing medicines keep their position; new ones are appended. */
export function mergeMedications(base: PlanMedication[], upserts: PlanMedication[]): PlanMedication[] {
  const out = base.map(clonePlanMedication);
  for (const u of upserts) {
    const idx = out.findIndex((m) => m.id === u.id);
    if (idx >= 0) out[idx] = clonePlanMedication(u);
    else out.push(clonePlanMedication(u));
  }
  return out;
}

/** Adds (or replaces) one staged medicine in a staged list. */
export function stageMedication(staged: PlanMedication[], med: PlanMedication): PlanMedication[] {
  return mergeMedications(staged, [med]);
}

export function unstageMedication(staged: PlanMedication[], id: string): PlanMedication[] {
  return staged.filter((m) => m.id !== id);
}

export function buildSnapshot(params: {
  base: PlanBase;
  upserts?: PlanMedication[];
  removeIds?: string[];
}): PlanSnapshotV2 {
  const remove = new Set(params.removeIds ?? []);
  const merged = mergeMedications(params.base.medications, params.upserts ?? []).filter((m) => !remove.has(m.id));
  const baseIds = new Set(params.base.medications.map((m) => m.id));
  const removed = new Set(params.base.removedMedicationIds);
  // Only medicines that existed in the plan need a removal marker; discarding a staged one needs none.
  for (const id of remove) if (baseIds.has(id)) removed.add(id);
  for (const m of merged) removed.delete(m.id);
  return {
    schemaVersion: 2,
    medications: merged,
    removedMedicationIds: [...removed],
  };
}

export type PlanIssueCode =
  | 'EMPTY_NAME'
  | 'SELF_DEPENDENCY'
  | 'MISSING_PARENT'
  | 'MISSING_PREREQUISITE'
  | 'PREREQUISITE_NEVER_ENDS'
  | 'DEPENDENCY_CYCLE'
  | 'MISSING_FALLBACK_TIME'
  | 'NO_REMINDER_TIME'
  | 'INVALID_TIME'
  | 'TOO_MANY_MEDICINES'
  | 'TOO_LARGE'
  | 'INVALID_PLAN';

export interface PlanIssue {
  code: PlanIssueCode;
  medicationId?: string;
  message: string;
}

export function snapshotByteSize(snapshot: PlanSnapshotV2): number {
  const json = JSON.stringify(snapshot);
  // UTF-8 byte length without relying on TextEncoder being present in every runtime
  let bytes = 0;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Validates a whole prescription with the same rules as `AppDatabase.validateDraftGraph`
 * (no self/parent loops, same-day parents exist, a follow-up needs a prerequisite that ends)
 * plus payload limits, so most mistakes are caught before anything is sent.
 */
export function validateSnapshot(snapshot: PlanSnapshotV2, opts: { knownExternalIds?: string[] } = {}): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const meds = snapshot.medications;
  const byId = new Map(meds.map((m) => [m.id, m]));
  const external = new Set(opts.knownExternalIds ?? []);
  const label = (m: PlanMedication) => m.name || 'This medicine';

  if (meds.length > 40) issues.push({ code: 'TOO_MANY_MEDICINES', message: 'A plan can hold at most 40 medicines.' });

  for (const m of meds) {
    if (!m.name.trim()) issues.push({ code: 'EMPTY_NAME', medicationId: m.id, message: 'Every medicine needs a name.' });

    const s = m.schedule;
    if (s.scheduleType === 'FIXED_TIMES' && s.fixedTimes.length === 0) {
      issues.push({ code: 'NO_REMINDER_TIME', medicationId: m.id, message: `${label(m)} needs at least one reminder time.` });
    }
    const times = [...s.fixedTimes, s.intervalFirstTime, m.sameDay?.fallbackTime].filter((t): t is string => !!t);
    if (times.some((t) => !HHMM.test(t))) {
      issues.push({ code: 'INVALID_TIME', medicationId: m.id, message: `${label(m)} has a time that is not in HH:MM format (for example 08:00).` });
    }

    if (m.sameDay) {
      const p = m.sameDay.parentMedicationId;
      if (p === m.id) issues.push({ code: 'SELF_DEPENDENCY', medicationId: m.id, message: `${label(m)} cannot follow itself.` });
      else if (!byId.has(p) && !external.has(p)) {
        issues.push({ code: 'MISSING_PARENT', medicationId: m.id, message: `The medicine ${label(m)} follows is no longer in the plan.` });
      }
      if (m.sameDay.fallbackPolicy === 'USE_FALLBACK_TIME' && !m.sameDay.fallbackTime) {
        issues.push({ code: 'MISSING_FALLBACK_TIME', medicationId: m.id, message: 'Enter the fallback time, or choose to skip this dose when the first one is skipped.' });
      }
    }
    if (m.startsAfter) {
      const p = m.startsAfter.prerequisiteMedicationId;
      const pre = byId.get(p);
      if (p === m.id) issues.push({ code: 'SELF_DEPENDENCY', medicationId: m.id, message: `${label(m)} cannot start after itself.` });
      else if (!pre && !external.has(p)) {
        issues.push({ code: 'MISSING_PREREQUISITE', medicationId: m.id, message: `The medicine ${label(m)} starts after is no longer in the plan.` });
      } else if (pre && pre.courseType === 'ONGOING') {
        issues.push({
          code: 'PREREQUISITE_NEVER_ENDS',
          medicationId: m.id,
          message: `${pre.name} has no end date or dose count, so ${label(m)} would never start.`,
        });
      }
    }
  }

  // Cycle detection over each edge type separately (as the phone does) and combined (as the applier does).
  const cycleIds = new Set<string>();
  const edges = (kinds: Array<'sameDay' | 'startsAfter'>) => (m: PlanMedication) => {
    const out: string[] = [];
    if (kinds.includes('sameDay') && m.sameDay) out.push(m.sameDay.parentMedicationId);
    if (kinds.includes('startsAfter') && m.startsAfter) out.push(m.startsAfter.prerequisiteMedicationId);
    return out;
  };
  for (const kinds of [['sameDay'], ['startsAfter'], ['sameDay', 'startsAfter']] as Array<Array<'sameDay' | 'startsAfter'>>) {
    const parentsOf = edges(kinds);
    const state = new Map<string, 1 | 2>();
    const visit = (m: PlanMedication) => {
      const st = state.get(m.id);
      if (st === 2) return;
      if (st === 1) {
        cycleIds.add(m.id);
        return;
      }
      state.set(m.id, 1);
      for (const pid of parentsOf(m)) {
        const parent = byId.get(pid);
        if (parent && pid !== m.id) visit(parent);
      }
      state.set(m.id, 2);
    };
    meds.forEach(visit);
  }
  for (const id of cycleIds) {
    issues.push({
      code: 'DEPENDENCY_CYCLE',
      medicationId: id,
      message: `${label(byId.get(id)!)} is part of a loop: these medicines would wait on each other. Choose a different medicine to follow.`,
    });
  }

  const parsed = PlanSnapshotV2Schema.safeParse(snapshot);
  if (!parsed.success && issues.length === 0) {
    issues.push({ code: 'INVALID_PLAN', message: 'Some medicine details are not valid. Please review each step.' });
  }
  if (snapshotByteSize(snapshot) >= MAX_PLAN_SNAPSHOT_BYTES) {
    issues.push({ code: 'TOO_LARGE', message: 'This plan is too large to send. Remove a medicine or shorten the instructions.' });
  }
  return issues;
}

export class PlanValidationError extends Error {
  constructor(public issues: PlanIssue[]) {
    super(issues[0]?.message ?? 'The plan is not valid.');
    this.name = 'PlanValidationError';
  }
}

/** Medicines in the (post-removal) plan that still depend on `id`. */
export function dependentsOf(meds: PlanMedication[], id: string): PlanMedication[] {
  return meds.filter(
    (m) => m.id !== id && (m.sameDay?.parentMedicationId === id || m.startsAfter?.prerequisiteMedicationId === id)
  );
}

/** Human-readable one-line schedule description of a plan medicine. */
export function describeSchedule(m: PlanMedication, nameOf: (id: string) => string = () => 'another medicine'): string {
  const s = m.schedule;
  let text: string;
  if (s.scheduleType === 'SAME_DAY_DEPENDENT' && m.sameDay) {
    text = `${m.sameDay.delayMinutes} min after ${nameOf(m.sameDay.parentMedicationId)} is taken`;
  } else if (s.scheduleType === 'INTERVAL') {
    text = `Every ${s.intervalHours ?? 6} hours from ${s.intervalFirstTime ?? '08:00'}`;
  } else {
    const times = s.fixedTimes.join(', ') || 'no time set';
    if (s.recurrenceType === 'SPECIFIC_DAYS') {
      const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      text = `${s.activeWeekdays.map((d) => names[d - 1]).join(', ')} at ${times}`;
    } else if (s.recurrenceType === 'CYCLE') {
      text = `${s.cycleDaysOn ?? '?'} days on, ${s.cycleDaysOff ?? '?'} off, at ${times}`;
    } else text = `Every day at ${times}`;
  }
  if (m.courseType === 'FIXED_DAYS' && m.maxDurationDays) text += ` for ${m.maxDurationDays} days`;
  if (m.courseType === 'FIXED_DOSES' && m.maxTotalDoses) text += `, ${m.maxTotalDoses} doses`;
  return text;
}
