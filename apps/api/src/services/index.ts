import type { Deps } from './deps';
import { AuthService } from './auth';
import { DeviceService } from './devices';
import { PairingService } from './pairing';
import { RelationshipService } from './relationships';
import { PlanService } from './plans';
import { SyncService } from './sync';
import { OutboxService } from './outbox';
import { RateLimiter } from './rate-limiter';
import { CaregiverRepo } from '../repos/caregivers';
import { OutboxRepo } from '../repos/outbox';

export class Services {
  readonly auth: AuthService;
  readonly devices: DeviceService;
  readonly pairing: PairingService;
  readonly relationships: RelationshipService;
  readonly plans: PlanService;
  readonly sync: SyncService;
  readonly outbox: OutboxService;
  constructor(readonly deps: Deps) {
    this.auth = new AuthService(deps);
    this.devices = new DeviceService(deps);
    this.pairing = new PairingService(deps);
    this.relationships = new RelationshipService(deps);
    this.plans = new PlanService(deps);
    this.sync = new SyncService(deps);
    this.outbox = new OutboxService(deps);
  }
  /** Cron: retry pending pushes and purge stale rows. */
  async maintenance() {
    const now = this.deps.now();
    const sent = await this.outbox.sweep();
    await this.pairing.sweep();
    await new RateLimiter(this.deps).purge();
    await new CaregiverRepo(this.deps.db).purgeExpiredRefresh(now.toISOString());
    await new OutboxRepo(this.deps.db).purge(new Date(now.getTime() - 14 * 86400_000).toISOString());
    return { outboxAttempted: sent };
  }
}
