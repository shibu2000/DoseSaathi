import type { AppDatabase } from '../database';
import type { SchedulerService } from '../alarms';
import { ApiClient, ApiError, type DoseEventUploadItem } from './api-client';
import { applyPlanSnapshot, buildDevicePlanReport } from './plan-applier';

export interface SyncResult {
  uploadedEventsCount: number;
  appliedCommandsCount: number;
  rejectedCommandsCount: number;
  planPublished: boolean;
  /** Set when sync could not run (offline, not linked...). Local features are never affected. */
  skippedReason?: 'NOT_SHARING' | 'NO_IDENTITY' | 'OFFLINE' | 'NOT_CONFIGURED' | 'ERROR';
  errors: string[];
}

const BATCH_SIZE = 100;
const CURSOR_KEY = 'sync_changes_cursor';
const PLAN_HASH_KEY = 'sync_plan_hash';
const PLAN_VERSION_KEY = 'sync_server_plan_version';

/** Cheap stable string hash (djb2) used to detect changes in what a caregiver can see. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Server error codes for which retrying the same event can never succeed. */
const PERMANENT_EVENT_ERRORS = new Set(['VALIDATION_ERROR', 'INVALID_EVENT', 'UNKNOWN_MEDICATION']);

/**
 * Synchronises the patient device with the backend. Every method is safe to call at any time and
 * never throws for connectivity problems: local alarms, dose recording and course transitions do not
 * depend on any of this.
 */
export class SyncWorker {
  constructor(
    private db: AppDatabase,
    private scheduler: SchedulerService,
    private api: ApiClient
  ) {}

  /** Whether this phone currently shares data with a caregiver (outbox events are only queued then). */
  async isSharing(): Promise<boolean> {
    return this.db.settings.getBoolean('family_sharing_active', false);
  }

  /**
   * Uploads queued dose events in idempotent batches. Events keep their original scheduled/action
   * timestamps and time zone; the server de-duplicates on `eventId`, so retries are always safe.
   */
  async syncOutbox(options: { force?: boolean } = {}): Promise<number> {
    let uploaded = 0;
    // Rows the server confirmed more than 30 days ago are no longer needed on the phone
    const cutoff = new Date(this.db.clock().getTime() - 30 * 24 * 3600 * 1000).toISOString();
    await this.db.connection.run(`DELETE FROM sync_outbox WHERE synced_at IS NOT NULL AND synced_at < ?;`, [cutoff]);
    // Drain in bounded batches
    for (let round = 0; round < 20; round++) {
      const pending = options.force ? await this.db.outbox.getAllUnsynced() : await this.db.outbox.getPending(BATCH_SIZE);
      const batchItems = pending.slice(0, BATCH_SIZE);
      if (batchItems.length === 0) break;

      const events: DoseEventUpload[] = [];
      const byEventId = new Map<string, (typeof batchItems)[number]>();
      const malformed: string[] = [];

      for (const item of batchItems) {
        try {
          const p = JSON.parse(item.payloadJson);
          const med = await this.db.medications.getById(p.medicationId ?? item.aggregateId);
          const isCourse = item.eventType.startsWith('COURSE_TRANSITION');
          const ev: DoseEventUpload = {
            eventId: item.eventId,
            eventType: item.eventType,
            medicationId: p.medicationId ?? item.aggregateId,
            occurrenceId: isCourse ? String(p.transitionEventId ?? item.eventId) : String(p.occurrenceId),
            scheduledAt: isCourse ? undefined : p.scheduledAtUtc,
            actionTimestamp: p.actionTimestampUtc ?? p.completedAt ?? p.undoneAt ?? item.createdAt,
            timezoneId: p.timezoneId ?? 'UTC',
            medicationName: med?.name,
            dosageText: med?.dosageText,
          };
          events.push(ev);
          byEventId.set(item.eventId, item);
        } catch {
          malformed.push(item.eventId);
        }
      }

      // Unreadable payloads can never be sent: retire them instead of retrying forever
      const nowIso = this.db.clock().toISOString();
      for (const id of malformed) await this.db.outbox.markSynced(id, nowIso);
      if (events.length === 0) continue;

      try {
        const res = await this.api.uploadDoseEvents(events as any);
        const failed = new Map(res.failedEvents.filter((f) => f.eventId).map((f) => [f.eventId as string, f]));
        for (const ev of events) {
          const f = failed.get(ev.eventId);
          if (!f) {
            await this.db.outbox.markSynced(ev.eventId, nowIso);
            uploaded++;
          } else if (PERMANENT_EVENT_ERRORS.has(f.code)) {
            await this.db.outbox.markSynced(ev.eventId, nowIso); // will never be accepted; stop retrying
          } else {
            await this.scheduleRetry(byEventId.get(ev.eventId)!.attempts, ev.eventId);
          }
        }
      } catch (err) {
        for (const ev of events) await this.scheduleRetry(byEventId.get(ev.eventId)!.attempts, ev.eventId);
        throw err;
      }

      if (batchItems.length < BATCH_SIZE) break;
    }
    return uploaded;
  }

  private async scheduleRetry(attempts: number, eventId: string) {
    // 1, 2, 4, 8 ... capped at 60 minutes
    const minutes = Math.min(60, 2 ** Math.min(attempts, 6));
    const next = new Date(this.db.clock().getTime() + minutes * 60 * 1000).toISOString();
    await this.db.outbox.recordFailedAttempt(eventId, next);
  }

  /**
   * Fetches pending caregiver commands, applies each in one local transaction, re-arms alarms and
   * acknowledges. The caregiver only sees "Applied" after this device has really committed the plan.
   */
  async syncDownstreamChanges(): Promise<{ applied: number; rejected: number }> {
    let applied = 0;
    let rejected = 0;

    const cursor = (await this.db.settings.get(CURSOR_KEY)) ?? undefined;
    const changes = await this.api.fetchChanges(cursor);

    const acks: Array<{ commandId: string; status: 'APPLIED' | 'REJECTED'; appliedVersion?: number; reasonCode?: string }> = [];
    let changedPlan = false;

    for (const cmd of changes.pendingCommands) {
      const result = await applyPlanSnapshot(this.db, {
        commandId: cmd.commandId,
        relationshipId: cmd.relationshipId,
        planVersion: cmd.planVersion,
        snapshot: cmd.planSnapshot,
      });
      if (result.status === 'APPLIED') {
        applied++;
        changedPlan = true;
        acks.push({ commandId: cmd.commandId, status: 'APPLIED', appliedVersion: cmd.planVersion });
      } else if (result.status === 'ALREADY_APPLIED') {
        // The ack was lost earlier: repeat it (the server treats this as a no-op if already recorded)
        const row = await this.db.connection.get<{ status: string; reason_code: string | null }>(
          `SELECT status, reason_code FROM applied_commands WHERE command_id = ?;`,
          [cmd.commandId]
        );
        if (row?.status === 'REJECTED') acks.push({ commandId: cmd.commandId, status: 'REJECTED', reasonCode: row.reason_code ?? 'REJECTED' });
        else acks.push({ commandId: cmd.commandId, status: 'APPLIED', appliedVersion: cmd.planVersion });
      } else {
        rejected++;
        acks.push({ commandId: cmd.commandId, status: 'REJECTED', reasonCode: result.code });
      }
    }

    if (changedPlan) await this.scheduler.reconcileAlarms();

    if (acks.length > 0) {
      await this.api.acknowledge(acks, changes.nextCursor);
    }
    if (changes.nextCursor) await this.db.settings.set(CURSOR_KEY, changes.nextCursor);

    return { applied, rejected };
  }

  /**
   * Publishes this device's plan and progress so caregivers see the real state. Only uploads when
   * the prescription or a medicine's lifecycle state changed (not on every dose), to keep traffic
   * and server plan versions low.
   */
  async publishDevicePlan(options: { force?: boolean } = {}): Promise<boolean> {
    const report = await buildDevicePlanReport(this.db);
    const fingerprint = hash(
      JSON.stringify({ m: report.medications, s: report.status.map((s) => [s.medicationId, s.lifecycleStatus]) })
    );
    if (!options.force && fingerprint === (await this.db.settings.get(PLAN_HASH_KEY))) return false;

    const known = Number((await this.db.settings.get(PLAN_VERSION_KEY)) ?? '0');
    try {
      const res = await this.api.uploadDevicePlan(known, report);
      await this.db.settings.set(PLAN_VERSION_KEY, String(res.planVersion));
      await this.db.settings.set(PLAN_HASH_KEY, fingerprint);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_STALE') {
        // A caregiver command is waiting: apply it first, then the next sync republishes
        const profile = await this.api.getDeviceProfile();
        await this.db.settings.set(PLAN_VERSION_KEY, String(profile.planVersion));
        return false;
      }
      throw err;
    }
  }

  /** One full sync pass. Offline/unconfigured/not-sharing are normal outcomes, not errors. */
  async syncAll(): Promise<SyncResult> {
    const result: SyncResult = {
      uploadedEventsCount: 0,
      appliedCommandsCount: 0,
      rejectedCommandsCount: 0,
      planPublished: false,
      errors: [],
    };
    if (!(await this.isSharing())) return { ...result, skippedReason: 'NOT_SHARING' };
    if (!this.api.isConfigured) return { ...result, skippedReason: 'NOT_CONFIGURED' };
    if (!(await this.api.hasDeviceIdentity())) return { ...result, skippedReason: 'NO_IDENTITY' };

    try {
      // Downstream first: apply what caregivers sent before reporting our own state
      const down = await this.syncDownstreamChanges();
      result.appliedCommandsCount = down.applied;
      result.rejectedCommandsCount = down.rejected;
      result.uploadedEventsCount = await this.syncOutbox();
      result.planPublished = await this.publishDevicePlan();
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) return { ...result, skippedReason: 'OFFLINE' };
      if (err instanceof ApiError && err.status === 401) {
        // This device was unregistered or its secret rotated: stop claiming to share
        result.errors.push('DEVICE_CREDENTIAL_REJECTED');
        return { ...result, skippedReason: 'ERROR' };
      }
      result.errors.push(err instanceof Error ? err.message : String(err));
      return { ...result, skippedReason: 'ERROR' };
    }
    return result;
  }
}

type DoseEventUpload = DoseEventUploadItem & { eventType: string };
