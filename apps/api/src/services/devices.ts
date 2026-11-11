import { log } from '../lib/logger';
import type { Deps } from './deps';
import { DeviceRepo, type DeviceRow } from '../repos/devices';
import { RelationshipRepo } from '../repos/relationships';
import { RateLimiter } from './rate-limiter';
import { randomToken, sha256Hex, timingSafeEqual } from '../lib/crypto';
import { unauthenticated } from '../lib/errors';
import type { DeviceActor } from '../lib/actors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEEN_THROTTLE_MS = 60_000;

export class DeviceService {
  readonly repo: DeviceRepo;
  private rels: RelationshipRepo;
  private limiter: RateLimiter;
  constructor(private deps: Deps) {
    this.repo = new DeviceRepo(deps.db);
    this.rels = new RelationshipRepo(deps.db);
    this.limiter = new RateLimiter(deps);
  }

  /** Parses `Authorization: Device <id>.<secret>` and verifies the secret hash in constant time. */
  async authenticate(header: string | undefined): Promise<DeviceActor> {
    const m = header?.match(/^Device ([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]{20,100})$/);
    if (!m || !UUID_RE.test(m[1]!)) throw unauthenticated('Invalid device credentials.');
    const device = await this.repo.findById(m[1]!.toLowerCase());
    const presented = await sha256Hex(m[2]!);
    // Compare against a dummy when the device is unknown to keep timing uniform.
    const ok = timingSafeEqual(presented, device?.secret_hash ?? '0'.repeat(64));
    if (!device || !ok) throw unauthenticated('Invalid device credentials.');
    const now = this.deps.now();
    await this.repo.touchSeen(device.id, now.toISOString(), new Date(now.getTime() - SEEN_THROTTLE_MS).toISOString());
    return { id: device.id, displayName: device.display_name };
  }

  async register(
    input: { platform: 'android' | 'ios'; appVersion: string; pushToken?: string | null; displayName?: string },
    ip: string,
  ): Promise<{ deviceId: string; deviceSecret: string; registeredAt: string }> {
    await this.limiter.enforce(`device:register:ip:${await RateLimiter.bucket(ip)}`, 20, 3600);
    const id = this.deps.uuid();
    const secret = randomToken(32);
    const now = this.deps.now().toISOString();
    await this.repo.insert({
      id, secretHash: await sha256Hex(secret), displayName: input.displayName ?? null, platform: input.platform,
      pushToken: input.pushToken ?? null, appVersion: input.appVersion, now,
    });
    return { deviceId: id, deviceSecret: secret, registeredAt: now };
  }

  /** Re-registration with valid Device auth: updates only token/version/name. */
  async refreshRegistration(
    device: DeviceActor,
    input: { appVersion: string; pushToken?: string | null; displayName?: string },
  ) {
    await this.repo.update(device.id, { appVersion: input.appVersion, pushToken: input.pushToken, displayName: input.displayName }, this.deps.now().toISOString());
    const row = (await this.repo.findById(device.id))!;
    return { deviceId: row.id, registeredAt: row.created_at, updated: true };
  }

  async update(device: DeviceActor, patch: { displayName?: string; pushToken?: string | null; appVersion?: string }) {
    await this.repo.update(device.id, patch, this.deps.now().toISOString());
    return this.profile(device.id);
  }

  async profile(id: string) {
    const d = (await this.repo.findById(id)) as DeviceRow;
    return {
      deviceId: d.id,
      displayName: d.display_name,
      platform: d.platform,
      appVersion: d.app_version,
      hasPushToken: d.push_token !== null,
      lastSeenAt: d.last_seen_at,
      lastSyncedAt: d.last_synced_at,
      planVersion: d.plan_version,
      lastAppliedVersion: d.last_applied_version,
    };
  }

  /** Unregisters the device; every relationship is revoked and the credential stops working. */
  async remove(device: DeviceActor) {
    const now = this.deps.now().toISOString();
    await this.deps.db.batch([...this.rels.endAllForDeviceStatements(device.id, now), ...this.repo.softDeleteStatements(device.id, now)]);
  }

  /**
   * Erases everything the server holds for this device: its identity, relationships, plan versions,
   * commands, uploaded dose events and sync cursor (all cascade from the device row). The medicines
   * and history stored on the phone itself are untouched.
   */
  async purge(device: DeviceActor) {
    await this.deps.db.prepare(`DELETE FROM patient_devices WHERE id = ?1`).bind(device.id).run();
    log('info', 'device_data_purged');
  }
}
