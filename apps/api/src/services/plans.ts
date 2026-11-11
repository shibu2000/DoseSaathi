import type { Deps } from './deps';
import { isUniqueViolation } from './deps';
import { PlanRepo, type CommandRow, type SnapshotRow } from '../repos/plans';
import { DeviceRepo } from '../repos/devices';
import { OutboxService } from './outbox';
import { AppError, conflict, notFound } from '../lib/errors';
import { sha256Hex } from '../lib/crypto';
import type { CaregiverRelationshipRow } from '../repos/relationships';
import type { DeviceActor } from '../lib/actors';
import { MAX_PLAN_SNAPSHOT_BYTES, type PlanSnapshotV2, type DevicePlanReport, type PlanMedication } from '@medchain/contracts';

const byteLength = (s: string) => new TextEncoder().encode(s).length;
const tooLarge = () => new AppError(413, 'PAYLOAD_TOO_LARGE', `Plan snapshot exceeds ${MAX_PLAN_SNAPSHOT_BYTES} bytes.`);

const SYNC_STATE: Record<string, string> = {
  PENDING_DEVICE: 'WAITING_FOR_DEVICE',
  RECEIVED: 'RECEIVED_BY_DEVICE',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
};

export function commandView(c: CommandRow) {
  return {
    commandId: c.id,
    status: c.status,
    syncState: SYNC_STATE[c.status]!,
    planVersion: c.plan_version,
    baseVersion: c.base_version,
    createdAt: c.created_at,
    receivedAt: c.received_at,
    appliedAt: c.status === 'APPLIED' ? c.applied_at : null,
    appliedVersion: c.status === 'APPLIED' ? c.applied_version : null,
    reasonCode: c.error_code,
  };
}

/** A visible snapshot row is either a caregiver snapshot (V2) or a device report; both carry `medications`. */
function prescription(row: SnapshotRow | null): PlanSnapshotV2 | null {
  if (!row) return null;
  const j = JSON.parse(row.snapshot_json);
  return { schemaVersion: 2, medications: j.medications ?? [], removedMedicationIds: row.source === 'CAREGIVER' ? (j.removedMedicationIds ?? []) : [] };
}

export class PlanService {
  private repo: PlanRepo;
  private devices: DeviceRepo;
  private outbox: OutboxService;
  constructor(private deps: Deps) {
    this.repo = new PlanRepo(deps.db);
    this.devices = new DeviceRepo(deps.db);
    this.outbox = new OutboxService(deps);
  }

  // ---- caregiver side ------------------------------------------------------
  private async freshHead(rel: CaregiverRelationshipRow) {
    const d = (await this.devices.findById(rel.patient_device_id))!;
    return { latest: d.plan_version, applied: d.last_applied_version };
  }

  async readPlan(rel: CaregiverRelationshipRow) {
    const head = await this.freshHead(rel);
    const snap = await this.repo.latestVisibleSnapshot(rel.patient_device_id);
    const report = await this.repo.latestDeviceReport(rel.patient_device_id);
    const open = await this.repo.latestOpenCommand(rel.id);
    return {
      latestPlanVersion: head.latest,
      lastAppliedVersion: head.applied,
      isApplied: head.applied >= head.latest,
      planSnapshot: prescription(snap),
      deviceReport: report
        ? { version: report.version, reportedAt: report.created_at, ...(JSON.parse(report.snapshot_json) as DevicePlanReport) }
        : null,
      pendingCommand: open ? { commandId: open.id, status: open.status } : null,
    };
  }

  async getMedication(rel: CaregiverRelationshipRow, medicationId: string) {
    const plan = await this.readPlan(rel);
    const medication = plan.planSnapshot?.medications.find((m) => m.id === medicationId);
    if (!medication) throw notFound('Medication not found.');
    const status = plan.deviceReport?.status.find((s) => s.medicationId === medicationId) ?? null;
    return { latestPlanVersion: plan.latestPlanVersion, lastAppliedVersion: plan.lastAppliedVersion, medication, deviceStatus: status };
  }

  async submitCommand(rel: CaregiverRelationshipRow, input: { key: string; baseVersion: number; snapshot: PlanSnapshotV2 }) {
    const json = JSON.stringify(input.snapshot);
    if (byteLength(json) > MAX_PLAN_SNAPSHOT_BYTES) throw tooLarge();
    const hash = await sha256Hex(`${input.baseVersion}:${json}`);

    const existing = await this.repo.findByIdempotency(rel.id, input.key);
    if (existing) return this.replay(existing, hash);

    const head = await this.freshHead(rel);
    if (input.baseVersion !== head.latest) {
      throw conflict('PLAN_VERSION_CONFLICT', `Plan is at version ${head.latest}; rebase your change.`);
    }
    const newVersion = (await this.repo.maxVersion(rel.patient_device_id)) + 1;
    const commandId = this.deps.uuid();
    const now = this.deps.now().toISOString();
    const ob = this.outbox.enqueueStatement(rel.patient_device_id, { type: 'PLAN_VERSION', relationshipId: rel.id, version: String(newVersion) });
    try {
      await this.deps.db.batch([
        this.repo.insertSnapshotStatement({ id: this.deps.uuid(), deviceId: rel.patient_device_id, version: newVersion, json, source: 'CAREGIVER', relationshipId: rel.id, now }),
        this.repo.supersedePendingStatement(rel.patient_device_id, newVersion),
        this.repo.insertCommandStatement({ id: commandId, relationshipId: rel.id, deviceId: rel.patient_device_id, key: input.key, hash, baseVersion: input.baseVersion, planVersion: newVersion, now }),
        this.repo.setHeadStatement(rel.patient_device_id, newVersion, head.latest, false),
        ob.statement,
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) {
        const again = await this.repo.findByIdempotency(rel.id, input.key);
        if (again) return this.replay(again, hash);
        throw conflict('PLAN_VERSION_CONFLICT', 'Plan changed concurrently; rebase your change.');
      }
      throw e;
    }
    this.outbox.dispatchAfterCommit([ob.id]);
    return commandView((await this.repo.findCommandForRelationship(commandId, rel.id))!);
  }

  private replay(existing: CommandRow, hash: string) {
    if (existing.request_hash !== hash) throw conflict('IDEMPOTENCY_KEY_REUSED', 'Idempotency key was used with a different request.');
    return commandView(existing);
  }

  /** Builds a new snapshot from the latest visible plan and submits it as a command. */
  async mutate(rel: CaregiverRelationshipRow, key: string, baseVersion: number, fn: (meds: PlanMedication[]) => { meds: PlanMedication[]; removed: string[] }) {
    const head = await this.freshHead(rel);
    if (baseVersion !== head.latest) throw conflict('PLAN_VERSION_CONFLICT', `Plan is at version ${head.latest}; rebase your change.`);
    const current = prescription(await this.repo.latestVisibleSnapshot(rel.patient_device_id));
    const { meds, removed } = fn(current?.medications ?? []);
    return this.submitCommand(rel, { key, baseVersion, snapshot: { schemaVersion: 2, medications: meds, removedMedicationIds: removed } });
  }

  async commandState(rel: CaregiverRelationshipRow, commandId: string) {
    const c = await this.repo.findCommandForRelationship(commandId, rel.id);
    if (!c) throw notFound('Command not found.');
    return commandView(c);
  }

  // ---- device side ---------------------------------------------------------
  async uploadDeviceReport(device: DeviceActor, baseVersion: number, report: DevicePlanReport) {
    const json = JSON.stringify(report);
    if (byteLength(json) > MAX_PLAN_SNAPSHOT_BYTES) throw tooLarge();
    const d = (await this.devices.findById(device.id))!;
    if (baseVersion !== d.plan_version || (await this.repo.pendingCommandCount(device.id)) > 0) {
      throw conflict('PLAN_STALE', `Server plan is at version ${d.plan_version} or has pending commands; fetch changes first.`);
    }
    const version = (await this.repo.maxVersion(device.id)) + 1;
    try {
      await this.deps.db.batch([
        this.repo.insertSnapshotStatement({ id: this.deps.uuid(), deviceId: device.id, version, json, source: 'DEVICE', relationshipId: null, now: this.deps.now().toISOString() }),
        this.repo.setHeadStatement(device.id, version, d.plan_version, true),
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('PLAN_STALE', 'Plan changed concurrently; fetch changes first.');
      throw e;
    }
    await this.devices.touchSynced(device.id, this.deps.now().toISOString());
    return { planVersion: version, lastAppliedVersion: version };
  }

  async changes(device: DeviceActor, cursorParam: string | undefined) {
    const now = this.deps.now().toISOString();
    const after = cursorParam !== undefined ? Number(cursorParam) : ((await this.devices.getCursor(device.id))?.commands_cursor ?? 0);
    const rows = await this.repo.openCommandsForDevice(device.id, after, 50);
    const out = [];
    for (const c of rows) {
      if (c.status === 'PENDING_DEVICE') await this.repo.markReceived(c.id, now);
      const snap = await this.repo.snapshotByVersion(device.id, c.plan_version);
      out.push({
        commandId: c.id, relationshipId: c.relationship_id, planVersion: c.plan_version, baseVersion: c.base_version,
        status: 'RECEIVED' as const, planSnapshot: snap ? JSON.parse(snap.snapshot_json) : null, createdAt: c.created_at,
      });
    }
    await this.devices.touchSynced(device.id, now);
    return { pendingCommands: out, nextCursor: String(rows.length ? rows[rows.length - 1]!.seq : after) };
  }

  async acks(device: DeviceActor, acks: Array<{ commandId: string; status: 'RECEIVED' | 'APPLIED' | 'REJECTED'; appliedVersion?: number; reasonCode?: string; errorCode?: string }>, cursor: string | undefined) {
    const now = this.deps.now().toISOString();
    const results = [];
    for (const a of acks) {
      const c = await this.repo.findCommandForDevice(a.commandId, device.id);
      if (!c) { results.push({ commandId: a.commandId, status: null, outcome: 'NOT_FOUND' }); continue; }
      let outcome: 'UPDATED' | 'UNCHANGED' | 'INVALID_TRANSITION';
      if (a.status === 'RECEIVED') {
        outcome = c.status === 'PENDING_DEVICE'
          ? ((await this.repo.transition(c.id, ['PENDING_DEVICE'], 'RECEIVED', { now })) ? 'UPDATED' : 'UNCHANGED')
          : (['RECEIVED', 'APPLIED', 'REJECTED'].includes(c.status) ? 'UNCHANGED' : 'INVALID_TRANSITION');
      } else if (a.status === 'APPLIED') {
        if (c.status === 'APPLIED') outcome = 'UNCHANGED';
        else if (c.status === 'PENDING_DEVICE' || c.status === 'RECEIVED') {
          const v = a.appliedVersion ?? c.plan_version;
          const ok = await this.repo.transition(c.id, ['PENDING_DEVICE', 'RECEIVED'], 'APPLIED', { now, appliedVersion: v });
          if (ok) await this.repo.raiseAppliedVersion(device.id, v);
          outcome = ok ? 'UPDATED' : 'UNCHANGED';
        } else outcome = 'INVALID_TRANSITION';
      } else {
        if (c.status === 'REJECTED') outcome = 'UNCHANGED';
        else if (c.status === 'PENDING_DEVICE' || c.status === 'RECEIVED') {
          const ok = await this.repo.transition(c.id, ['PENDING_DEVICE', 'RECEIVED'], 'REJECTED', { now, errorCode: a.reasonCode ?? a.errorCode ?? 'REJECTED_BY_DEVICE' });
          if (ok) await this.deps.db.batch(this.repo.rejectSnapshotStatements(device.id, c.plan_version, now));
          outcome = ok ? 'UPDATED' : 'UNCHANGED';
        } else outcome = 'INVALID_TRANSITION';
      }
      const fresh = await this.repo.findCommandForDevice(c.id, device.id);
      results.push({ commandId: c.id, status: fresh!.status, outcome });
    }
    if (cursor !== undefined && /^\d{1,15}$/.test(cursor)) await this.devices.setCursor(device.id, Number(cursor), now);
    await this.devices.touchSynced(device.id, now);
    return { success: true, results, cursor: String((await this.devices.getCursor(device.id))?.commands_cursor ?? 0) };
  }
}
