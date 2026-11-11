import { rateLimited } from '../lib/errors';
import { sha256Hex } from '../lib/crypto';
import type { Deps } from './deps';
import { RateLimitRepo } from '../repos/ratelimit';

export class RateLimiter {
  private repo: RateLimitRepo;
  constructor(private deps: Deps) {
    this.repo = new RateLimitRepo(deps.db);
  }
  private nowS() {
    return Math.floor(this.deps.now().getTime() / 1000);
  }
  /** Counts this attempt; throws 429 once `limit` is exceeded within the window. */
  async enforce(key: string, limit: number, windowSeconds: number): Promise<void> {
    const { count, retryAfter } = await this.repo.hit(key, windowSeconds, this.nowS());
    if (count > limit) throw rateLimited(retryAfter);
  }
  /** Throws 429 if `limit` failures were already recorded (does not count). */
  async assertBelow(key: string, limit: number, windowSeconds: number): Promise<void> {
    const { count, retryAfter } = await this.repo.peek(key, windowSeconds, this.nowS());
    if (count >= limit) throw rateLimited(retryAfter);
  }
  async recordFailure(key: string, windowSeconds: number): Promise<void> {
    await this.repo.hit(key, windowSeconds, this.nowS());
  }
  reset(key: string) {
    return this.repo.reset(key);
  }
  /** Stable, non-reversible bucket id for an IP or email. */
  static async bucket(value: string): Promise<string> {
    return (await sha256Hex(value)).slice(0, 24);
  }
  async purge() {
    await this.repo.purge(this.nowS() - 24 * 3600);
  }
}
