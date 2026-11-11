import type { Deps } from './deps';
import { isUniqueViolation } from './deps';
import { PairingRepo, type PairingSessionRow, type RequestWithContext, type RequestStatus } from '../repos/pairing';
import { DeviceRepo } from '../repos/devices';
import { RelationshipRepo } from '../repos/relationships';
import { OutboxService } from './outbox';
import { RateLimiter } from './rate-limiter';
import { AppError, conflict, notFound } from '../lib/errors';
import { hmacSha256Hex, randomSixDigitCode, randomToken, timingSafeEqual } from '../lib/crypto';
import { toSummary } from './relationships';
import type { CaregiverActor, DeviceActor } from '../lib/actors';
import type { PermissionKey } from '@medchain/contracts';

export const PAIRING_TTL_SECONDS = 600;
const MAX_SECRET_FAILS = 5;
export type PairingCredential = { code: string } | { sessionId: string; secret: string };

const invalidCode = () => new AppError(404, 'PAIRING_CODE_INVALID', 'This code is invalid or has expired.');

export class PairingService {
  private repo: PairingRepo;
  private devices: DeviceRepo;
  private rels: RelationshipRepo;
  private outbox: OutboxService;
  private limiter: RateLimiter;
  constructor(private deps: Deps) {
    this.repo = new PairingRepo(deps.db);
    this.devices = new DeviceRepo(deps.db);
    this.rels = new RelationshipRepo(deps.db);
    this.outbox = new OutboxService(deps);
    this.limiter = new RateLimiter(deps);
  }

  private pepper() {
    return this.deps.env.PAIRING_PEPPER ?? '';
  }
  private codeHash(code: string) {
    return hmacSha256Hex(this.pepper(), `code:${code}`);
  }
  private secretHash(sessionId: string, secret: string) {
    return hmacSha256Hex(this.pepper(), `secret:${sessionId}:${secret}`);
  }
  private nowIso() {
    return this.deps.now().toISOString();
  }

  // ---- patient device ------------------------------------------------------
  async createSession(device: DeviceActor) {
    const row = (await this.devices.findById(device.id))!;
    if (!row.display_name) throw new AppError(422, 'DISPLAY_NAME_REQUIRED', 'Set a display name before sharing.');
    await this.limiter.enforce(`pair:create:dev:${device.id}`, 5, 600);
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = this.deps.uuid();
      const code = randomSixDigitCode();
      const secret = randomToken(32);
      const now = this.deps.now();
      const expiresAt = new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000).toISOString();
      try {
        await this.deps.db.batch([
          ...this.repo.invalidateDeviceSessionsStatements(device.id, now.toISOString()),
          this.repo.insertSessionStatement({
            id, deviceId: device.id, codeHash: await this.codeHash(code), secretHash: await this.secretHash(id, secret), expiresAt, now: now.toISOString(),
          }),
        ]);
      } catch (e) {
        if (isUniqueViolation(e)) continue; // code collision with another live session
        throw e;
      }
      return {
        sessionId: id, pairingCode: code, qrPayload: `dosesaathi://pair?session=${id}&secret=${secret}`,
        expiresAt, expiresInSeconds: PAIRING_TTL_SECONDS,
      };
    }
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Could not allocate a pairing code. Try again.');
  }

  async regenerate(device: DeviceActor, sessionId: string) {
    const s = await this.repo.findSession(sessionId);
    if (!s || s.patient_device_id !== device.id) throw notFound();
    return this.createSession(device);
  }

  private derivedRequestStatus(r: RequestWithContext): RequestStatus {
    return r.status === 'PENDING' && r.session_expires_at <= this.nowIso() ? 'EXPIRED' : r.status;
  }

  async getSession(device: DeviceActor, sessionId: string) {
    const s = await this.repo.findSession(sessionId);
    if (!s || s.patient_device_id !== device.id) throw notFound();
    const req = await this.repo.findRequestContextBySession(sessionId);
    const status = s.status === 'PENDING' && s.expires_at <= this.nowIso() ? 'EXPIRED' : s.status;
    return {
      sessionId: s.id,
      status,
      expiresAt: s.expires_at,
      incomingRequest: req && {
        requestId: req.id,
        status: this.derivedRequestStatus(req),
        caregiverDisplayName: req.caregiver_display_name,
        caregiverEmail: req.caregiver_email,
        requestedPermissions: JSON.parse(req.requested_permissions_json) as PermissionKey[],
        requestedAt: req.requested_at,
        relationshipId: req.relationship_id,
      },
    };
  }

  // ---- caregiver -----------------------------------------------------------
  /** Rate limits + code/QR resolution. Every failure looks identical to the caller. */
  private async resolve(caregiver: CaregiverActor, cred: PairingCredential, ip: string, pathSessionId?: string): Promise<PairingSessionRow> {
    const failKey = `pair:fail:cg:${caregiver.id}`;
    await this.limiter.enforce(`pair:attempt:cg:${caregiver.id}`, 10, 600);
    await this.limiter.enforce(`pair:attempt:ip:${await RateLimiter.bucket(ip)}`, 30, 600);
    await this.limiter.assertBelow(failKey, 5, 900);
    const now = this.nowIso();
    let session: PairingSessionRow | null = null;
    if ('code' in cred) {
      session = await this.repo.findLiveSessionByCodeHash(await this.codeHash(cred.code), now);
      if (session && pathSessionId && session.id !== pathSessionId) session = null;
    } else {
      const s = await this.repo.findSession(cred.sessionId);
      if (s && (!pathSessionId || pathSessionId === s.id) && s.status === 'PENDING' && s.expires_at > now) {
        if (timingSafeEqual(await this.secretHash(s.id, cred.secret), s.secret_hash)) session = s;
        else await this.repo.recordFailedSecret(s.id, MAX_SECRET_FAILS);
      }
    }
    if (!session) {
      await this.limiter.recordFailure(failKey, 900);
      throw invalidCode();
    }
    return session;
  }

  async validate(caregiver: CaregiverActor, cred: PairingCredential, ip: string) {
    const s = await this.resolve(caregiver, cred, ip);
    const d = await this.devices.findById(s.patient_device_id);
    return { valid: true, sessionId: s.id, patientDisplayName: d?.display_name ?? '', expiresAt: s.expires_at };
  }

  async createRequest(caregiver: CaregiverActor, cred: PairingCredential, permissions: PermissionKey[], ip: string, pathSessionId?: string) {
    await this.limiter.enforce(`pair:request:cg:${caregiver.id}`, 10, 3600);
    const s = await this.resolve(caregiver, cred, ip, pathSessionId);
    if (await this.rels.findActivePair(s.patient_device_id, caregiver.id)) {
      throw conflict('ALREADY_CONNECTED', 'You are already connected to this person.');
    }
    if (!(await this.repo.consume(s.id, this.nowIso()))) throw invalidCode();
    const requestId = this.deps.uuid();
    const ob = this.outbox.enqueueStatement(s.patient_device_id, { type: 'PAIRING_REQUEST', sessionId: s.id });
    await this.deps.db.batch([
      this.repo.insertRequestStatement({ id: requestId, sessionId: s.id, caregiverId: caregiver.id, permissionsJson: JSON.stringify(permissions), now: this.nowIso() }),
      ob.statement,
    ]);
    this.outbox.dispatchAfterCommit([ob.id]);
    const d = await this.devices.findById(s.patient_device_id);
    return { requestId, sessionId: s.id, status: 'PENDING' as const, expiresAt: s.expires_at, patientDisplayName: d?.display_name ?? '' };
  }

  private async ownRequest(caregiver: CaregiverActor, requestId: string) {
    const r = await this.repo.findRequestContext(requestId);
    if (!r || r.caregiver_user_id !== caregiver.id) throw notFound();
    return r;
  }

  async requestStatus(caregiver: CaregiverActor, requestId: string) {
    const r = await this.ownRequest(caregiver, requestId);
    const relationship = r.relationship_id ? await this.rels.findForCaregiver(r.relationship_id, caregiver.id) : null;
    return {
      requestId: r.id,
      status: this.derivedRequestStatus(r),
      expiresAt: r.session_expires_at,
      respondedAt: r.responded_at,
      relationshipId: r.relationship_id,
      relationship: relationship ? toSummary(relationship) : null,
    };
  }

  async cancelRequest(caregiver: CaregiverActor, requestId: string) {
    const r = await this.ownRequest(caregiver, requestId);
    if (r.status === 'CANCELLED') return { status: 'CANCELLED' as const };
    if (!(await this.repo.transitionRequest(r.id, 'CANCELLED', this.nowIso()))) {
      throw conflict('REQUEST_NOT_PENDING', 'This request can no longer be cancelled.');
    }
    return { status: 'CANCELLED' as const };
  }

  // ---- patient responses ---------------------------------------------------
  private async deviceRequest(device: DeviceActor, requestId: string) {
    const r = await this.repo.findRequestContext(requestId);
    if (!r || r.patient_device_id !== device.id) throw notFound();
    return r;
  }
  private approvedResult(r: RequestWithContext, rel: { id: string; permissions_json: string; confirmed_at: string }) {
    return { requestId: r.id, status: 'APPROVED' as const, relationshipId: rel.id, permissions: JSON.parse(rel.permissions_json) as PermissionKey[], confirmedAt: rel.confirmed_at };
  }

  async approve(device: DeviceActor, requestId: string, input: { approvedPermissions: PermissionKey[]; relationshipLabel: string }) {
    let r = await this.deviceRequest(device, requestId);
    if (r.status === 'APPROVED') return this.approvedResult(r, (await this.rels.findById(r.relationship_id!))!);
    if (r.status !== 'PENDING') throw conflict('REQUEST_NOT_PENDING', `Request is ${r.status.toLowerCase()}.`);
    const now = this.nowIso();
    if (r.session_expires_at <= now) {
      await this.repo.transitionRequest(r.id, 'EXPIRED', now);
      throw new AppError(410, 'PAIRING_EXPIRED', 'This request has expired.');
    }
    const requested = JSON.parse(r.requested_permissions_json) as PermissionKey[];
    if (!input.approvedPermissions.every((p) => requested.includes(p))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'body.approvedPermissions', message: 'Cannot approve permissions that were not requested' }]);
    }
    const relationshipId = this.deps.uuid();
    try {
      await this.deps.db.batch(this.repo.approveStatements({ requestId, relationshipId, label: input.relationshipLabel, permissionsJson: JSON.stringify(input.approvedPermissions), now }));
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    r = (await this.repo.findRequestContext(requestId))!;
    if (r.status === 'APPROVED') return this.approvedResult(r, (await this.rels.findById(r.relationship_id!))!);
    throw conflict('ALREADY_CONNECTED', 'Could not create the connection.');
  }

  async decline(device: DeviceActor, requestId: string) {
    const r = await this.deviceRequest(device, requestId);
    if (r.status === 'DECLINED') return { requestId, status: 'DECLINED' as const };
    if (r.status !== 'PENDING') throw conflict('REQUEST_NOT_PENDING', `Request is ${r.status.toLowerCase()}.`);
    const now = this.nowIso();
    if (r.session_expires_at <= now) {
      await this.repo.transitionRequest(r.id, 'EXPIRED', now);
      throw new AppError(410, 'PAIRING_EXPIRED', 'This request has expired.');
    }
    if (!(await this.repo.transitionRequest(r.id, 'DECLINED', now))) throw conflict('REQUEST_NOT_PENDING', 'Request is no longer pending.');
    return { requestId, status: 'DECLINED' as const };
  }

  async sweep() {
    await this.repo.expirePending(this.nowIso());
  }
}
