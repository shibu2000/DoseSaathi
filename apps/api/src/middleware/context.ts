import type { Context, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import type { AppContext } from '../env';
import { AppError } from '../lib/errors';
import { log } from '../lib/logger';
import { Services } from '../services';
import type { Deps } from '../services/deps';
import { createPushDispatcher } from '../services/push/fcm';
import type { PushDispatcher } from '../services/push/dispatcher';

export const MAX_BODY_BYTES = 64 * 1024;

export interface AppOptions {
  now?: () => Date;
  uuid?: () => string;
  push?: PushDispatcher;
  /** Overrides ctx.waitUntil (tests can await background work). */
  schedule?: (p: Promise<unknown>) => void;
}

export const clientIp = (c: Context): string => c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown';

export function buildDeps(env: AppContext['Bindings'], opts: AppOptions, waitUntil?: (p: Promise<unknown>) => void): Deps {
  return {
    db: env.DB,
    env,
    now: opts.now ?? (() => new Date()),
    uuid: opts.uuid ?? (() => crypto.randomUUID()),
    push: opts.push ?? createPushDispatcher(env),
    schedule: opts.schedule ?? waitUntil ?? ((p) => void p.catch(() => undefined)),
  };
}

export const requestContext = (opts: AppOptions): MiddlewareHandler<AppContext> => async (c, next) => {
  const supplied = c.req.header('X-Request-Id');
  const requestId = supplied && /^[A-Za-z0-9._-]{1,64}$/.test(supplied) ? supplied : crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  let wait: ((p: Promise<unknown>) => void) | undefined;
  try {
    const ctx = c.executionCtx;
    wait = (p) => ctx.waitUntil(p);
  } catch {
    wait = undefined;
  }
  c.set('svc', new Services(buildDeps(c.env, opts, wait)));
  const start = Date.now();
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  log('info', 'request', { requestId, method: c.req.method, route: c.req.routePath, status: c.res.status, durationMs: Date.now() - start });
};

export const corsFromEnv: MiddlewareHandler<AppContext> = async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return next();
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  })(c, next);
};

export const limitBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  },
});
