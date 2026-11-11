import type { Deps } from './deps';
import { CaregiverRepo, type CaregiverRow } from '../repos/caregivers';
import { AppError, unauthenticated, conflict } from '../lib/errors';
import { RateLimiter } from './rate-limiter';
import { base64UrlToBytes, pbkdf2Hash, randomBytes, bytesToBase64Url, randomToken, sha256Hex, signJwt, verifyJwt, timingSafeEqual, MAX_PBKDF2_ITERATIONS } from '../lib/crypto';
import { isUniqueViolation } from './deps';
import { log } from '../lib/logger';
import type { CaregiverActor } from '../lib/actors';

/** Provider-neutral identity adapter. Swap the implementation to move to another IdP. */
export interface IdentityProvider {
  readonly name: string;
  /** Returns the provider subject plus any provider-owned statements to run in the same batch as the user insert. */
  register(input: { userId: string; email: string; password: string }): Promise<{ subject: string; statements: D1PreparedStatement[] }>;
  /** Verifies credentials; returns the provider subject or null. Must take similar time for unknown users. */
  authenticate(email: string, password: string): Promise<{ subject: string } | null>;
}

const DEFAULT_ITERATIONS = MAX_PBKDF2_ITERATIONS;

export class LocalPasswordProvider implements IdentityProvider {
  readonly name = 'local-password';
  constructor(private db: D1Database, private now: () => Date, private iterations: number) {}

  async register(input: { userId: string; email: string; password: string }) {
    const salt = randomBytes(16);
    const hash = await pbkdf2Hash(input.password, salt, this.iterations);
    const now = this.now().toISOString();
    return {
      subject: input.userId,
      statements: [
        this.db
          .prepare(
            `INSERT INTO caregiver_credentials (caregiver_user_id, password_hash, salt, iterations, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)`,
          )
          .bind(input.userId, hash, bytesToBase64Url(salt), this.iterations, now),
      ],
    };
  }

  async authenticate(email: string, password: string) {
    const row = await this.db
      .prepare(
        `SELECT u.auth_subject, c.password_hash, c.salt, c.iterations FROM caregiver_users u
         JOIN caregiver_credentials c ON c.caregiver_user_id = u.id
         WHERE u.email = ?1 AND u.auth_provider = 'local-password'`,
      )
      .bind(email)
      .first<{ auth_subject: string; password_hash: string; salt: string; iterations: number }>();
    if (!row) {
      await pbkdf2Hash(password, new Uint8Array(16), this.iterations); // equalise timing
      return null;
    }
    
    const candidate = await pbkdf2Hash(password, base64UrlToBytes(row.salt), row.iterations);
    return timingSafeEqual(candidate, row.password_hash) ? { subject: row.auth_subject } : null;
  }
}

const ISS = 'medchain-api';
const AUD = 'medchain-caregiver';
const REFRESH_TTL_DAYS = 30;

export interface TokenBundle {
  caregiver: CaregiverActor;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export class AuthService {
  private repo: CaregiverRepo;
  private limiter: RateLimiter;
  private provider: IdentityProvider;

  constructor(private deps: Deps, provider?: IdentityProvider) {
    this.repo = new CaregiverRepo(deps.db);
    this.limiter = new RateLimiter(deps);
    const it = Math.min(Number(deps.env.PASSWORD_HASH_ITERATIONS) || DEFAULT_ITERATIONS, MAX_PBKDF2_ITERATIONS);
    this.provider = provider ?? new LocalPasswordProvider(deps.db, deps.now, it);
  }

  private secret(): string {
    const s = this.deps.env.JWT_SECRET;
    if (!s || s.length < 16) {
      log('error', 'jwt_secret_missing');
      throw new AppError(500, 'SERVER_MISCONFIGURED', 'Server is not configured for authentication.');
    }
    return s;
  }
  private ttlSeconds(): number {
    const v = Number(this.deps.env.ACCESS_TOKEN_TTL_SECONDS) || 1800;
    return Math.min(3600, Math.max(900, v));
  }

  async register(input: { email: string; password: string; displayName: string }, ip: string): Promise<TokenBundle> {
    this.secret();
    await this.limiter.enforce(`auth:register:ip:${await RateLimiter.bucket(ip)}`, 10, 3600);
    if (await this.repo.findByEmail(input.email)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
    const userId = this.deps.uuid();
    const reg = await this.provider.register({ userId, email: input.email, password: input.password });
    const now = this.deps.now().toISOString();
    try {
      await this.deps.db.batch([
        this.repo.insertUserStatement({ id: userId, provider: this.provider.name, subject: reg.subject, email: input.email, displayName: input.displayName, now }),
        ...reg.statements,
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
      throw e;
    }
    const user = (await this.repo.findById(userId))!;
    return this.issue(user, this.deps.uuid());
  }

  async login(input: { email: string; password: string }, ip: string): Promise<TokenBundle> {
    this.secret();
    const emailBucket = await RateLimiter.bucket(input.email);
    const failKey = `auth:login:fail:${emailBucket}`;
    await this.limiter.enforce(`auth:login:ip:${await RateLimiter.bucket(ip)}`, 30, 900);
    await this.limiter.assertBelow(failKey, 10, 900);
    const auth = await this.provider.authenticate(input.email, input.password);
    const user = auth ? await this.repo.findBySubject(this.provider.name, auth.subject) : null;
    if (!user || user.disabled_at) {
      await this.limiter.recordFailure(failKey, 900);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    await this.limiter.reset(failKey);
    return this.issue(user, this.deps.uuid());
  }

  async refresh(refreshToken: string, ip: string): Promise<TokenBundle> {
    this.secret();
    await this.limiter.enforce(`auth:refresh:ip:${await RateLimiter.bucket(ip)}`, 60, 900);
    const row = await this.repo.findRefreshByHash(await sha256Hex(refreshToken));
    const now = this.deps.now();
    if (!row || row.revoked_at) throw unauthenticated('Invalid refresh token.');
    if (row.rotated_at) {
      await this.repo.revokeFamily(row.family_id, now.toISOString()); // reuse detected
      log('warn', 'refresh_token_reuse', { familyId: row.family_id });
      throw unauthenticated('Invalid refresh token.');
    }
    if (row.expires_at <= now.toISOString()) throw unauthenticated('Refresh token expired.');
    if (!(await this.repo.markRotated(row.id, now.toISOString()))) throw unauthenticated('Invalid refresh token.');
    const user = await this.repo.findById(row.caregiver_user_id);
    if (!user || user.disabled_at) throw unauthenticated('Invalid refresh token.');
    return this.issue(user, row.family_id);
  }

  async logout(refreshToken: string): Promise<void> {
    const row = await this.repo.findRefreshByHash(await sha256Hex(refreshToken));
    if (row) await this.repo.revokeFamily(row.family_id, this.deps.now().toISOString());
  }

  /**
   * Permanently deletes the caregiver's account and everything tied to it (credentials, sessions,
   * relationships, their plan commands). The password is required again so a stolen access token
   * alone cannot destroy an account. Patient data on the patient's own phone is never affected.
   */
  async deleteAccount(actor: CaregiverActor, password: string, ip: string): Promise<void> {
    await this.limiter.enforce(`auth:delete:ip:${await RateLimiter.bucket(ip)}`, 10, 900);
    const auth = await this.provider.authenticate(actor.email, password);
    const user = auth ? await this.repo.findBySubject(this.provider.name, auth.subject) : null;
    if (!user || user.id !== actor.id) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect password.');
    await this.deps.db.prepare(`DELETE FROM caregiver_users WHERE id = ?1`).bind(actor.id).run();
    log('info', 'caregiver_account_deleted');
  }

  async verifyAccessToken(token: string): Promise<CaregiverActor> {
    const claims = await verifyJwt(token, this.secret(), { iss: ISS, aud: AUD, nowSeconds: Math.floor(this.deps.now().getTime() / 1000) });
    if (!claims) throw unauthenticated('Invalid or expired access token.');
    const user = await this.repo.findById(claims.sub);
    if (!user || user.disabled_at) throw unauthenticated('Invalid or expired access token.');
    return { id: user.id, email: user.email, displayName: user.display_name };
  }

  private async issue(user: CaregiverRow, familyId: string): Promise<TokenBundle> {
    const now = this.deps.now();
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + this.ttlSeconds();
    const accessToken = await signJwt({ iss: ISS, aud: AUD, sub: user.id, iat, exp }, this.secret());
    const refreshToken = randomToken(32);
    const refreshExp = new Date(now.getTime() + REFRESH_TTL_DAYS * 86400_000).toISOString();
    await this.repo.insertRefreshToken({
      id: this.deps.uuid(), userId: user.id, familyId, hash: await sha256Hex(refreshToken), expiresAt: refreshExp, now: now.toISOString(),
    }).run();
    return {
      caregiver: { id: user.id, email: user.email, displayName: user.display_name },
      accessToken,
      accessTokenExpiresAt: new Date(exp * 1000).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExp,
    };
  }
}
