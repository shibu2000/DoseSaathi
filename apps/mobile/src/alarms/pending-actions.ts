import type { AppDatabase, DoseActionResult } from '../database';
import type { PendingAlarmAction } from '../../modules/medchain-alarm/src';

export interface AlarmQueueNative {
  getPendingAlarmActions(): PendingAlarmAction[];
  ackPendingAlarmActions(ids: string[]): void;
}

let testQueue: AlarmQueueNative | null = null;

/** Tests only: stand-in for the native queue. */
export function __setAlarmQueueForTests(queue: AlarmQueueNative | null): void {
  testQueue = queue;
}

/** Loaded lazily (like the alarm adapters) so Bun tests and iOS never pull in the native module. */
function nativeQueue(): AlarmQueueNative | null {
  if (testQueue) return testQueue;
  try {
    const { MedchainAlarm } = require('../../modules/medchain-alarm/src');
    return MedchainAlarm?.getPendingAlarmActions ? (MedchainAlarm as AlarmQueueNative) : null;
  } catch {
    return null;
  }
}

/** Settings' "Send test alarm" uses this id; it never touches medicine data. */
const TEST_OCCURRENCE_ID = 'test_occurrence_preview';

export interface AppliedAlarmAction {
  medicationId: string;
  action: 'TAKEN' | 'SNOOZED' | 'SKIPPED';
  result: DoseActionResult;
}

// Plain listener set (no react-native import: the scheduler that calls this also runs in Bun tests).
const appliedListeners = new Set<(applied: AppliedAlarmAction[]) => void>();

/** Called after queued alarm actions changed the database (e.g. to show low-stock notices). */
export function onAlarmActionsApplied(listener: (applied: AppliedAlarmAction[]) => void): () => void {
  appliedListeners.add(listener);
  return () => appliedListeners.delete(listener);
}

/**
 * An action whose dose row does not exist yet (e.g. a follow-up medicine whose phase starts today, armed
 * from a prediction) is kept and retried for this long before it is given up.
 */
const KEEP_UNRESOLVED_MS = 48 * 3600 * 1000;

/**
 * Records dose actions the user took on the native alarm screen or notification buttons (Taken /
 * Snooze 10-30 min / Skip). Native code stops the alarm instantly and queues the decision; this saves it
 * with the original tap time. Must run before anything that flags or re-arms doses (reconcile,
 * maintenance), otherwise a native snooze could be cancelled before the database knows about it.
 *
 * Calls are serialized: a call made while another is running gets its OWN run afterwards (so it also
 * sees actions queued meanwhile). `recordDoseAction` ignores replays for an already-handled dose.
 */
export function applyPendingAlarmActions(db: AppDatabase): Promise<AppliedAlarmAction[]> {
  const native = nativeQueue();
  if (!native) return Promise.resolve([]);
  const run = chain.then(
    () => drain(db, native),
    () => drain(db, native)
  );
  chain = run.catch(() => {});
  return run;
}

let chain: Promise<unknown> = Promise.resolve();

async function drain(db: AppDatabase, native: AlarmQueueNative): Promise<AppliedAlarmAction[]> {
  const applied: AppliedAlarmAction[] = [];
  const done: string[] = [];
  const now = db.clock().getTime();
  try {
    for (const p of native.getPendingAlarmActions()) {
      if (p.occurrenceId === TEST_OCCURRENCE_ID) {
        done.push(p.id);
        continue;
      }
      const fresh = now - p.atMillis < KEEP_UNRESOLVED_MS;
      try {
        const result = await db.recordDoseAction({
          medicationId: p.medicationId,
          occurrenceId: p.occurrenceId,
          action: p.action,
          actionTimestampUtc: new Date(p.atMillis).toISOString(),
          snoozeMinutes: p.action === 'SNOOZED' ? p.snoozeMinutes : undefined,
        });
        if (result.applied) {
          done.push(p.id);
          applied.push({ medicationId: p.medicationId, action: p.action, result });
        } else if (fresh && (await isWaitingToStart(db, p.medicationId))) {
          // Medicine still queued for its phase: keep the action until its dose becomes real.
        } else {
          done.push(p.id); // already handled (replay) or medicine no longer active
        }
      } catch (err) {
        const message = String((err as Error)?.message ?? err);
        if (/not found|does not belong/i.test(message)) {
          // Row not created yet for a medicine that still exists: retry later. Deleted: give up.
          const medExists = !!(await db.medications.getById(p.medicationId).catch(() => null));
          if (!(fresh && medExists)) done.push(p.id);
        } else {
          console.warn('Could not record alarm action; will retry', err);
        }
      }
    }
  } finally {
    if (done.length) {
      try {
        native.ackPendingAlarmActions(done);
      } catch {}
    }
  }
  if (applied.length) {
    for (const listener of appliedListeners) {
      try {
        listener(applied);
      } catch {}
    }
  }
  return applied;
}

async function isWaitingToStart(db: AppDatabase, medicationId: string): Promise<boolean> {
  const med = await db.medications.getById(medicationId).catch(() => null);
  return med?.lifecycleStatus === 'QUEUED_PHASE';
}
