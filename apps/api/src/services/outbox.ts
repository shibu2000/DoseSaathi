import type { Deps } from './deps';
import { OutboxRepo, type OutboxRow } from '../repos/outbox';
import { DeviceRepo } from '../repos/devices';
import { log } from '../lib/logger';

export type PushType = 'PLAN_VERSION' | 'PAIRING_REQUEST' | 'RELATIONSHIP_CHANGED';
export const MAX_OUTBOX_ATTEMPTS = 8;

export class OutboxService {
  private repo: OutboxRepo;
  private devices: DeviceRepo;
  constructor(private deps: Deps) {
    this.repo = new OutboxRepo(deps.db);
    this.devices = new DeviceRepo(deps.db);
  }

  /** Statement to include in the SAME batch as the change that needs a push. Payload: opaque ids/versions only. */
  enqueueStatement(deviceId: string, data: { type: PushType } & Record<string, string>) {
    const id = this.deps.uuid();
    return { id, statement: this.repo.insertStatement({ id, kind: data.type, deviceId, payload: data, now: this.deps.now().toISOString() }) };
  }

  /** Fire-and-forget dispatch after the DB commit. */
  dispatchAfterCommit(ids: string[]): void {
    if (ids.length === 0) return;
    this.deps.schedule(
      (async () => {
        for (const id of ids) {
          const row = await this.repo.findById(id);
          if (row) await this.dispatchOne(row);
        }
      })().catch(() => log('error', 'outbox_dispatch_failed')),
    );
  }

  /** Retry sweep (cron). Returns number of rows attempted. */
  async sweep(limit = 50): Promise<number> {
    const rows = await this.repo.due(this.deps.now().toISOString(), limit);
    let n = 0;
    for (const row of rows) {
      await this.dispatchOne(row);
      n++;
    }
    return n;
  }

  async dispatchOne(row: OutboxRow): Promise<void> {
    const now = this.deps.now();
    const lock = new Date(now.getTime() + 60_000).toISOString();
    if (!(await this.repo.claim(row.id, now.toISOString(), lock))) return;
    const attempts = row.attempts + 1;
    const device = await this.devices.findById(row.patient_device_id);
    if (!device || !device.push_token || !this.deps.push.enabled) {
      await this.repo.finish(row.id, 'SKIPPED', now.toISOString(), device?.push_token ? 'PUSH_DISABLED' : 'NO_TOKEN');
      return;
    }
    const result = await this.deps.push.send({ token: device.push_token, data: JSON.parse(row.payload_json) });
    if (result.ok) {
      await this.repo.finish(row.id, 'SENT', now.toISOString(), null);
      return;
    }
    if (result.tokenInvalid) await this.devices.clearPushToken(device.id);
    if (!result.retryable || attempts >= MAX_OUTBOX_ATTEMPTS) {
      await this.repo.finish(row.id, 'DEAD', now.toISOString(), result.code);
      return;
    }
    const delayS = Math.min(30 * 2 ** (attempts - 1), 3600);
    await this.repo.retryLater(row.id, new Date(now.getTime() + delayS * 1000).toISOString(), result.code);
  }
}
