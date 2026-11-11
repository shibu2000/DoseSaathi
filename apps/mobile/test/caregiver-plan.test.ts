import { describe, it, expect } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase, DEFAULT_WIZARD_DRAFT, type WizardDraft } from '../src/database';
import { applyPlanSnapshot, planMedicationToDraft } from '../src/sync/plan-applier';
import { ApiError } from '../src/sync/api-client';
import {
  draftToPlanMedication,
  buildSnapshot,
  baseFromPlanState,
  validateSnapshot,
  mergeMedications,
  stageMedication,
  unstageMedication,
  dependentsOf,
  snapshotByteSize,
  describeSchedule,
} from '../src/caregiver/plan-composer';
import { describeCommandState, describeDeviceStatus, formatRelativeTime } from '../src/caregiver/command-state';
import { submitComposedPlan, PlanConflictError } from '../src/caregiver/submit';
import { loadStaged, saveStaged, stagedKey, type SettingsStore } from '../src/caregiver/staged-store';
import type { PlanMedication, PlanSnapshotV2 } from '@medchain/contracts';

const id = () => crypto.randomUUID();
const draft = (over: Partial<WizardDraft>): WizardDraft => ({ ...DEFAULT_WIZARD_DRAFT, name: 'Med', dosageText: '1 tablet', ...over });

describe('draft <-> plan medication round trip', () => {
  const cases: Array<[string, Partial<WizardDraft>]> = [
    ['fixed times daily with stock', { name: 'Metformin', dosageText: '500 mg', doseQuantity: 2, doseUnit: 'mL', instructions: 'With food', trackStock: true, currentStock: 40, lowStockThreshold: 7, fixedTimes: ['08:00', '20:00'] }],
    ['specific days fixed doses', { recurrenceType: 'SPECIFIC_DAYS', activeWeekdays: [1, 3, 5], courseType: 'FIXED_DOSES', maxTotalDoses: 12 }],
    ['cycle', { recurrenceType: 'CYCLE', cycleDaysOn: 5, cycleDaysOff: 2, cycleAnchorDate: '2026-11-09', courseType: 'FIXED_DAYS', maxDurationDays: 21 }],
    ['interval', { scheduleType: 'INTERVAL', intervalHours: 8, intervalFirstTime: '06:30', fixedTimes: [] }],
    ['same-day dependent with fallback', { scheduleType: 'SAME_DAY_DEPENDENT', sameDayParentMedicationId: id(), sameDayDelayMinutes: 45, sameDayFallbackPolicy: 'USE_FALLBACK_TIME', sameDayFallbackTime: '12:15', fixedTimes: [] }],
    ['follow-up course', { hasPrerequisiteCourse: true, prerequisiteMedicationId: id(), phaseDelayHours: 24, courseType: 'FIXED_DAYS', maxDurationDays: 7 }],
  ];
  for (const [name, over] of cases) {
    it(`preserves every field: ${name}`, () => {
      const medId = id();
      const d = draft(over);
      const plan = draftToPlanMedication(d, medId);
      const back = planMedicationToDraft(plan, false);
      expect(back.editingMedicationId).toBe(medId);
      // Every field the caregiver set survives; fields that do not apply to the schedule type are normalised away.
      for (const key of Object.keys(over) as Array<keyof WizardDraft>) expect(back[key]).toEqual(d[key]);
      expect(back.name).toBe(d.name);
      expect(back.dosageText).toBe(d.dosageText);
      // and plan -> draft -> plan is stable
      expect(draftToPlanMedication(back, medId)).toEqual(plan);
    });
  }

  it('produces a schema-valid snapshot', () => {
    const snap = buildSnapshot({ base: { medications: [], removedMedicationIds: [], status: [] }, upserts: [draftToPlanMedication(draft({ name: 'X' }), id())] });
    expect(validateSnapshot(snap)).toEqual([]);
  });
});

describe('merging and removals', () => {
  const a = draftToPlanMedication(draft({ name: 'A' }), id());
  const b = draftToPlanMedication(draft({ name: 'B' }), id());

  it('upserts by id, keeps order and appends new', () => {
    const a2 = { ...a, name: 'A2' };
    const c = draftToPlanMedication(draft({ name: 'C' }), id());
    const merged = mergeMedications([a, b], [a2, c]);
    expect(merged.map((m) => m.name)).toEqual(['A2', 'B', 'C']);
  });

  it('records removal of existing medicines, not of staged ones', () => {
    const staged = draftToPlanMedication(draft({ name: 'S' }), id());
    const snap = buildSnapshot({ base: { medications: [a, b], removedMedicationIds: [], status: [] }, upserts: [staged], removeIds: [b.id, staged.id] });
    expect(snap.medications.map((m) => m.name)).toEqual(['A']);
    expect(snap.removedMedicationIds).toEqual([b.id]);
  });

  it('carries unapplied removals forward only while the previous command is pending', () => {
    const ghost = id();
    const plan = { planSnapshot: { schemaVersion: 2 as const, medications: [a], removedMedicationIds: [ghost] } };
    expect(baseFromPlanState({ ...plan, isApplied: false }).removedMedicationIds).toEqual([ghost]);
    expect(baseFromPlanState({ ...plan, isApplied: true }).removedMedicationIds).toEqual([]);
  });

  it('falls back to the device report when no snapshot was ever published', () => {
    const base = baseFromPlanState({ planSnapshot: null, deviceReport: { schemaVersion: 2, medications: [a], status: [{ medicationId: a.id, lifecycleStatus: 'ACTIVE', dosesTakenCount: 3 }] } });
    expect(base.medications).toHaveLength(1);
    expect((base.medications[0] as any).dosesTakenCount).toBeUndefined();
    expect(base.status[0].dosesTakenCount).toBe(3);
  });

  it('stages and unstages', () => {
    const s = stageMedication([], a);
    expect(unstageMedication(s, a.id)).toEqual([]);
  });

  it('finds dependents', () => {
    const child = draftToPlanMedication(draft({ name: 'child', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.id }), id());
    expect(dependentsOf([a, child], a.id).map((m) => m.name)).toEqual(['child']);
  });
});

describe('validation', () => {
  const mk = (name: string, over: Partial<WizardDraft> = {}, medId = id()) => draftToPlanMedication(draft({ name, ...over }), medId);
  const snap = (medications: PlanMedication[]): PlanSnapshotV2 => ({ schemaVersion: 2, medications, removedMedicationIds: [] });

  it('rejects a follow-up of an ONGOING medicine', () => {
    const a = mk('A');
    const b = mk('B', { hasPrerequisiteCourse: true, prerequisiteMedicationId: a.id });
    expect(validateSnapshot(snap([a, b])).map((i) => i.code)).toContain('PREREQUISITE_NEVER_ENDS');
  });

  it('detects prerequisite and same-day cycles', () => {
    const a = mk('A', { courseType: 'FIXED_DAYS', maxDurationDays: 3 });
    const b = mk('B', { courseType: 'FIXED_DAYS', maxDurationDays: 3, hasPrerequisiteCourse: true, prerequisiteMedicationId: a.id });
    a.startsAfter = { prerequisiteMedicationId: b.id, phaseDelayHours: 0 };
    expect(validateSnapshot(snap([a, b])).some((i) => i.code === 'DEPENDENCY_CYCLE')).toBe(true);

    const c = mk('C', { scheduleType: 'SAME_DAY_DEPENDENT', fixedTimes: [] });
    const d = mk('D', { scheduleType: 'SAME_DAY_DEPENDENT', fixedTimes: [] });
    c.sameDay = { parentMedicationId: d.id, delayMinutes: 30 };
    d.sameDay = { parentMedicationId: c.id, delayMinutes: 30 };
    expect(validateSnapshot(snap([c, d])).some((i) => i.code === 'DEPENDENCY_CYCLE')).toBe(true);
  });

  it('detects self dependency, missing parent and missing fallback time', () => {
    const a = mk('A', { scheduleType: 'SAME_DAY_DEPENDENT', fixedTimes: [] });
    a.sameDay = { parentMedicationId: a.id, delayMinutes: 10 };
    expect(validateSnapshot(snap([a])).map((i) => i.code)).toContain('SELF_DEPENDENCY');
    const b = mk('B', { scheduleType: 'SAME_DAY_DEPENDENT', sameDayParentMedicationId: id(), fixedTimes: [] });
    expect(validateSnapshot(snap([b])).map((i) => i.code)).toContain('MISSING_PARENT');
    const p = mk('P');
    const c = mk('C', { scheduleType: 'SAME_DAY_DEPENDENT', sameDayParentMedicationId: p.id, sameDayFallbackPolicy: 'USE_FALLBACK_TIME', fixedTimes: [] });
    expect(validateSnapshot(snap([p, c])).map((i) => i.code)).toContain('MISSING_FALLBACK_TIME');
  });

  it('enforces the 16 KB limit', () => {
    const meds = Array.from({ length: 40 }, (_, i) => mk(`Med ${i}`, { instructions: 'x'.repeat(480) }));
    const s = snap(meds);
    expect(snapshotByteSize(s)).toBeGreaterThan(16 * 1024);
    expect(validateSnapshot(s).map((i) => i.code)).toContain('TOO_LARGE');
  });
});

describe('command state mapping', () => {
  it('never reports success before APPLIED', () => {
    for (const status of ['PENDING_DEVICE', 'RECEIVED', 'REJECTED', 'SUPERSEDED']) {
      const v = describeCommandState({ status });
      expect(v.tone).not.toBe('success');
      expect(v.label.toLowerCase()).not.toContain('applied on');
    }
    expect(describeCommandState({ status: 'APPLIED' })).toMatchObject({ label: 'Applied on the phone', tone: 'success', terminal: true });
  });
  it('uses plain language', () => {
    expect(describeCommandState({ status: 'PENDING_DEVICE' }).label).toBe('Waiting for the phone to connect');
    expect(describeCommandState({ status: 'RECEIVED' }).label).toBe('Phone received it');
    const r = describeCommandState({ status: 'REJECTED', reasonCode: 'DEPENDENCY_CYCLE' });
    expect(r.label).toBe('The phone could not apply this');
    expect(r.detail).toContain('wait on each other');
    expect(describeCommandState({ status: 'REJECTED', reasonCode: 'NOT_CAREGIVER_MEDICINE' }).detail).toContain('added on the phone');
  });
  it('describes device status', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    expect(describeDeviceStatus(null, null, now).text).toBe("Hasn't connected yet");
    expect(describeDeviceStatus('2026-11-09T11:55:00Z', null, now).text).toBe('Seen 5 min ago');
    expect(describeDeviceStatus('2026-11-08T08:00:00Z', null, now).text).toBe('Last seen yesterday');
    expect(formatRelativeTime('garbage', now)).toBeNull();
  });
  it('describes schedules', () => {
    const m = draftToPlanMedication(draft({ fixedTimes: ['08:00'], courseType: 'FIXED_DAYS', maxDurationDays: 4 }), id());
    expect(describeSchedule(m)).toBe('Every day at 08:00 for 4 days');
  });
});

describe('submitComposedPlan', () => {
  const a = draftToPlanMedication(draft({ name: 'A' }), id());
  const mkApi = (conflicts: number) => {
    let version = 3;
    const calls: Array<{ baseVersion: number; key: string }> = [];
    return {
      calls,
      getPlan: async () => ({ latestPlanVersion: version, lastAppliedVersion: version, isApplied: true, planSnapshot: { schemaVersion: 2 as const, medications: [a], removedMedicationIds: [] }, pendingCommand: null }),
      submitPlanCommand: async (_rel: string, p: { baseVersion: number }, key: string) => {
        calls.push({ baseVersion: p.baseVersion, key });
        if (calls.length <= conflicts) {
          version += 1;
          throw new ApiError(409, 'PLAN_VERSION_CONFLICT', 'conflict');
        }
        return { commandId: 'srv-cmd', status: 'PENDING_DEVICE', planVersion: p.baseVersion + 1, syncState: 'WAITING_FOR_DEVICE', createdAt: '' };
      },
    };
  };
  const add = (base: any) => buildSnapshot({ base, upserts: [draftToPlanMedication(draft({ name: 'New' }), id())] });

  it('uses the server latestPlanVersion as baseVersion and returns the server command id', async () => {
    const api = mkApi(0);
    const res = await submitComposedPlan(api as any, 'rel', add, 'key-12345678');
    expect(res.commandId).toBe('srv-cmd');
    expect(api.calls[0]).toEqual({ baseVersion: 3, key: 'key-12345678' });
    expect(res.snapshot.medications).toHaveLength(2);
  });
  it('re-fetches and retries once on a version conflict', async () => {
    const api = mkApi(1);
    const res = await submitComposedPlan(api as any, 'rel', add, 'key-12345678');
    expect(api.calls.map((c) => c.baseVersion)).toEqual([3, 4]);
    expect(api.calls[1].key).not.toBe(api.calls[0].key);
    expect(res.commandId).toBe('srv-cmd');
  });
  it('gives up after a second conflict', async () => {
    const api = mkApi(2);
    await expect(submitComposedPlan(api as any, 'rel', add, 'key-12345678')).rejects.toBeInstanceOf(PlanConflictError);
  });
  it('does not send an invalid plan', async () => {
    const api = mkApi(0);
    const bad = (base: any) => buildSnapshot({ base, upserts: [draftToPlanMedication(draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.id }), id())] });
    await expect(submitComposedPlan(api as any, 'rel', bad, 'key-12345678')).rejects.toThrow();
    expect(api.calls).toHaveLength(0);
  });
});

describe('staged store', () => {
  const mem = (): SettingsStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v), delete: async (k) => void data.delete(k) };
  };
  it('persists per relationship and ignores corrupt entries', async () => {
    const s = mem();
    const a = draftToPlanMedication(draft({ name: 'A' }), id());
    await saveStaged(s, 'r1', [a]);
    expect(await loadStaged(s, 'r1')).toEqual([a]);
    expect(await loadStaged(s, 'r2')).toEqual([]);
    s.data.set(stagedKey('r3'), '{not json');
    expect(await loadStaged(s, 'r3')).toEqual([]);
    await saveStaged(s, 'r1', []);
    expect(s.data.has(stagedKey('r1'))).toBe(false);
  });
});

describe('Day-1 multi-phase prescription composes to an applicable snapshot', () => {
  it('A for 4 days, then B, C (after B same-day +30m), D', async () => {
    const [A, B, C, D] = [id(), id(), id(), id()];
    const dA = draft({ name: 'Antibiotic', courseType: 'FIXED_DAYS', maxDurationDays: 4 });
    const dB = draft({ name: 'B', courseType: 'FIXED_DAYS', maxDurationDays: 7, hasPrerequisiteCourse: true, prerequisiteMedicationId: A });
    const dC = draft({ name: 'C', scheduleType: 'SAME_DAY_DEPENDENT', fixedTimes: [], sameDayParentMedicationId: B, sameDayDelayMinutes: 30, courseType: 'FIXED_DAYS', maxDurationDays: 7, hasPrerequisiteCourse: true, prerequisiteMedicationId: A });
    const dD = draft({ name: 'D', fixedTimes: ['21:00'], courseType: 'FIXED_DAYS', maxDurationDays: 7, hasPrerequisiteCourse: true, prerequisiteMedicationId: A });

    let staged: PlanMedication[] = [];
    for (const [d, mid] of [[dA, A], [dB, B], [dC, C]] as Array<[WizardDraft, string]>) staged = stageMedication(staged, draftToPlanMedication(d, mid));
    const snapshot = buildSnapshot({ base: { medications: [], removedMedicationIds: [], status: [] }, upserts: [...staged, draftToPlanMedication(dD, D)] });
    expect(validateSnapshot(snapshot)).toEqual([]);

    const db = await AppDatabase.initialize(new BunSqliteAdapter(':memory:'));
    db.tz = 'Asia/Kolkata';
    db.clock = () => new Date('2026-11-09T01:30:00.000Z');
    await db.ensurePrimaryProfile();
    const res = await applyPlanSnapshot(db, { commandId: id(), relationshipId: id(), planVersion: 1, snapshot });
    expect(res.status).toBe('APPLIED');
    const st = async (x: string) => (await db.medications.getById(x))!.lifecycleStatus;
    expect(await st(A)).toBe('ACTIVE');
    expect(await st(B)).toBe('QUEUED_PHASE');
    expect(await st(C)).toBe('QUEUED_PHASE');
    expect(await st(D)).toBe('QUEUED_PHASE');
  });
});

import { mergeFeeds } from '../src/caregiver/activity-merge';
import { buildTodayView } from '../src/caregiver/today-view';

describe('activity merge', () => {
  const it_ = (id: string, ts: string) => ({ eventId: id, actionTimestamp: ts });
  it('merges newest first and holds back items beyond the shortest loaded window', () => {
    const a = { items: [it_('a1', '2026-11-09T10:00:00Z'), it_('a2', '2026-11-09T08:00:00Z')], nextCursor: 'c' };
    const b = { items: [it_('b1', '2026-11-09T09:00:00Z'), it_('b2', '2026-11-05T09:00:00Z')], nextCursor: null };
    const r = mergeFeeds([a, b]);
    expect(r.items.map((x) => x.eventId)).toEqual(['a1', 'b1', 'a2']);
    expect(r.hasMore).toBe(true);
    expect(r.heldBack).toBe(1);
    expect(mergeFeeds([{ ...a, nextCursor: null }, b]).items).toHaveLength(4);
  });
});

describe('today view', () => {
  const MED = id();
  const report = {
    schemaVersion: 2 as const,
    medications: [draftToPlanMedication(draft({ name: 'Metformin', fixedTimes: ['08:00', '20:00'] }), MED)],
    status: [{ medicationId: MED, lifecycleStatus: 'ACTIVE' as const, dosesTakenCount: 5, courseStartAt: '2026-11-01T00:00:00.000Z' }],
  };
  const now = new Date('2026-11-09T12:00:00Z'); // 17:30 IST
  const base = { report, now, tz: 'Asia/Kolkata' };

  it('derives rows only from the phone report and real events; no event is never "missed"', () => {
    const v = buildTodayView({ ...base, events: [], includeUpcoming: true });
    expect(v.rows.map((r) => [r.timeLocal, r.state])).toEqual([['08:00', 'NOT_CONFIRMED_YET'], ['20:00', 'UPCOMING']]);
  });
  it('overlays real events', () => {
    const events = [{ medicationId: MED, medicationName: 'Metformin', dosageText: '1 tablet', eventType: 'DOSE_TAKEN', scheduledAt: '2026-11-09T02:30:00.000Z', actionTimestamp: '2026-11-09T02:40:00.000Z', timezoneId: 'Asia/Kolkata' }];
    const v = buildTodayView({ ...base, events, includeUpcoming: true });
    expect(v.rows[0].state).toBe('TAKEN');
  });
  it('hides the future preview when stale and reports unknown when events are unavailable', () => {
    const v = buildTodayView({ ...base, events: [], includeUpcoming: false, eventsKnown: false });
    expect(v.rows.map((r) => r.state)).toEqual(['UNKNOWN']);
  });
  it('shows nothing for a phone that never reported', () => {
    expect(buildTodayView({ ...base, report: null, events: [], includeUpcoming: true }).rows).toEqual([]);
  });
});
