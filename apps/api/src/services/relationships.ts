import type { Deps } from './deps';
import { RelationshipRepo, type CaregiverRelationshipRow, type PatientRelationshipRow, type RelationshipRow } from '../repos/relationships';
import { OutboxService } from './outbox';
import { AppError, notFound } from '../lib/errors';
import type { PermissionKey } from '@medchain/contracts';

export const parsePermissions = (r: { permissions_json: string }): PermissionKey[] => JSON.parse(r.permissions_json);

export function toSummary(r: CaregiverRelationshipRow) {
  return {
    relationshipId: r.id,
    patientDisplayName: r.patient_display_name ?? '',
    relationshipLabel: r.relationship_label,
    permissions: parsePermissions(r),
    status: r.status,
    confirmedAt: r.confirmed_at,
    revokedAt: r.revoked_at,
    version: r.version,
    deviceLastSeenAt: r.device_last_seen_at,
    lastSyncedAt: r.device_last_synced_at,
    latestPlanVersion: r.plan_version,
    lastAppliedVersion: r.last_applied_version,
  };
}
export function toPatientView(r: PatientRelationshipRow) {
  return {
    relationshipId: r.id,
    caregiverDisplayName: r.caregiver_display_name,
    caregiverEmail: r.caregiver_email,
    relationshipLabel: r.relationship_label,
    permissions: parsePermissions(r),
    status: r.status,
    confirmedAt: r.confirmed_at,
    revokedAt: r.revoked_at,
    version: r.version,
  };
}

export class RelationshipService {
  readonly repo: RelationshipRepo;
  private outbox: OutboxService;
  constructor(private deps: Deps) {
    this.repo = new RelationshipRepo(deps.db);
    this.outbox = new OutboxService(deps);
  }

  /** Participant-scoped access check used by requireRelationshipAccess. */
  async resolveForCaregiver(id: string, caregiverId: string, permission: PermissionKey | null, allowInactive: boolean) {
    const row = await this.repo.findForCaregiver(id, caregiverId);
    if (!row) throw notFound();
    if (!allowInactive) {
      if (row.status !== 'ACTIVE') throw new AppError(403, 'RELATIONSHIP_INACTIVE', 'This connection has ended.');
      if (permission && !parsePermissions(row).includes(permission)) {
        throw new AppError(403, 'PERMISSION_DENIED', 'You do not have permission for this action.');
      }
    }
    return row;
  }

  async listForCaregiver(caregiverId: string) {
    return (await this.repo.listActiveForCaregiver(caregiverId)).map(toSummary);
  }

  async disconnect(row: CaregiverRelationshipRow): Promise<string> {
    if (row.status !== 'ACTIVE') return row.status;
    const now = this.deps.now().toISOString();
    const ob = this.outbox.enqueueStatement(row.patient_device_id, { type: 'RELATIONSHIP_CHANGED', relationshipId: row.id });
    await this.deps.db.batch([...this.repo.endStatements(row.id, 'DISCONNECTED_BY_CAREGIVER', now), ob.statement]);
    this.outbox.dispatchAfterCommit([ob.id]);
    return 'DISCONNECTED_BY_CAREGIVER';
  }

  async listForDevice(deviceId: string) {
    return (await this.repo.listForDevice(deviceId)).map(toPatientView);
  }

  async revokeByPatient(deviceId: string, id: string): Promise<string> {
    const row = await this.repo.findForDevice(id, deviceId);
    if (!row) throw notFound();
    if (row.status !== 'ACTIVE') return row.status;
    await this.deps.db.batch(this.repo.endStatements(id, 'REVOKED_BY_PATIENT', this.deps.now().toISOString()));
    return 'REVOKED_BY_PATIENT';
  }

  async restrict(deviceId: string, id: string, permissions: PermissionKey[]) {
    const row = await this.repo.findForDevice(id, deviceId);
    if (!row) throw notFound();
    if (row.status !== 'ACTIVE') throw new AppError(403, 'RELATIONSHIP_INACTIVE', 'This connection has ended.');
    const current = parsePermissions(row);
    if (!permissions.every((p) => current.includes(p))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Permissions can only be reduced.', [{ field: 'body.permissions', message: 'Cannot grant permissions that were not approved' }]);
    }
    await this.repo.updatePermissions(id, JSON.stringify(permissions));
    return toPatientView((await this.repo.findForDevice(id, deviceId))!);
  }

  async summaryFor(id: string, caregiverId: string) {
    const r = await this.repo.findForCaregiver(id, caregiverId);
    return r ? toSummary(r) : null;
  }
}

export type { RelationshipRow };
