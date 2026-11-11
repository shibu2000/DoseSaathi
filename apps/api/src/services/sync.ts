import type { Deps } from './deps';
import { EventRepo, type DoseEventRow } from '../repos/events';
import { DeviceRepo } from '../repos/devices';
import { DoseEventUploadSchema } from '@medchain/contracts';
import { bytesToBase64Url, base64UrlToBytes } from '../lib/crypto';
import { validation } from '../lib/errors';
import type { DeviceActor } from '../lib/actors';
import type { CaregiverRelationshipRow } from '../repos/relationships';

const LABELS: Record<string, string> = {
  DOSE_TAKEN: 'Taken',
  DOSE_SKIPPED: 'Skipped',
  DOSE_SNOOZED: 'Snoozed',
  DOSE_NOT_CONFIRMED: 'Not confirmed',
  COURSE_TRANSITION_COMPLETED: 'Course completed',
  COURSE_TRANSITION_UNDONE: 'Course completion undone',
};
const MAX_FUTURE_SKEW_MS = 24 * 3600_000;
const iso = (s: string) => new Date(s).toISOString();

export class SyncService {
  private events: EventRepo;
  private devices: DeviceRepo;
  constructor(private deps: Deps) {
    this.events = new EventRepo(deps.db);
    this.devices = new DeviceRepo(deps.db);
  }

  async upload(device: DeviceActor, rawEvents: unknown[]) {
    const nowDate = this.deps.now();
    const now = nowDate.toISOString();
    const failed: Array<{ index: number; eventId: string | null; code: string; message: string }> = [];
    const stmts: D1PreparedStatement[] = [];
    rawEvents.forEach((raw, index) => {
      const p = DoseEventUploadSchema.safeParse(raw);
      if (!p.success) {
        const id = typeof (raw as { eventId?: unknown })?.eventId === 'string' ? (raw as { eventId: string }).eventId : null;
        failed.push({ index, eventId: id, code: 'INVALID_EVENT', message: p.error.issues[0]?.message ?? 'Invalid event' });
        return;
      }
      const e = p.data;
      if (new Date(e.actionTimestamp).getTime() > nowDate.getTime() + MAX_FUTURE_SKEW_MS) {
        failed.push({ index, eventId: e.eventId, code: 'FUTURE_TIMESTAMP', message: 'actionTimestamp is in the future' });
        return;
      }
      stmts.push(
        this.events.insertStatement({
          eventId: e.eventId, deviceId: device.id, medicationId: e.medicationId, occurrenceId: e.occurrenceId, eventType: e.eventType,
          scheduledAt: iso(e.scheduledAt ?? e.actionTimestamp), actionTimestamp: iso(e.actionTimestamp), timezoneId: e.timezoneId,
          medicationName: e.medicationName ?? null, dosageText: e.dosageText ?? null, now,
        }),
      );
    });
    let accepted = 0;
    if (stmts.length) {
      const results = await this.deps.db.batch(stmts);
      accepted = results.reduce((n, r) => n + (r.meta.changes === 1 ? 1 : 0), 0);
    }
    await this.devices.touchSynced(device.id, now);
    const duplicates = stmts.length - accepted;
    return { accepted, duplicates, processedCount: accepted + duplicates, failedEvents: failed };
  }

  async activity(rel: CaregiverRelationshipRow, limit: number, cursor: string | undefined) {
    let c: { ts: string; seq: number } | null = null;
    if (cursor) {
      try {
        const [ts, seq] = new TextDecoder().decode(base64UrlToBytes(cursor)).split('|');
        if (!ts || !/^\d{1,15}$/.test(seq ?? '') || Number.isNaN(Date.parse(ts))) throw new Error();
        c = { ts, seq: Number(seq) };
      } catch {
        throw validation([{ field: 'query.cursor', message: 'Invalid cursor' }]);
      }
    }
    const rows = await this.events.page(rel.patient_device_id, rel.confirmed_at, c, limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => this.item(r, rel)),
      nextCursor: rows.length > limit && last ? bytesToBase64Url(new TextEncoder().encode(`${last.action_timestamp}|${last.seq}`)) : null,
    };
  }

  private item(r: DoseEventRow, rel: CaregiverRelationshipRow) {
    return {
      eventId: r.event_id, relationshipId: rel.id, patientDisplayName: rel.patient_display_name ?? '', medicationId: r.medication_id,
      medicationName: r.medication_name, dosageText: r.dosage_text, occurrenceId: r.occurrence_id, eventType: r.event_type,
      statusLabel: LABELS[r.event_type]!, scheduledAt: r.scheduled_at, actionTimestamp: r.action_timestamp, timezoneId: r.timezone_id, receivedAt: r.received_at,
    };
  }
}
