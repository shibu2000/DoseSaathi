import { Hono } from 'hono';
import type { AppContext, Env } from './env';
import { AppError } from './lib/errors';
import { log } from './lib/logger';
import { corsFromEnv, limitBody, requestContext, buildDeps, type AppOptions } from './middleware/context';
import { Services } from './services';
import { healthRouter } from './routes/health';
import { legalRouter } from './routes/legal';
import { authRouter } from './routes/auth';
import { devicesRouter } from './routes/devices';
import { pairingRouter } from './routes/pairing';
import { relationshipsRouter } from './routes/relationships';
import { medicationsRouter } from './routes/medications';
import { syncRouter } from './routes/sync';

export function createApp(opts: AppOptions = {}) {
  const app = new Hono<AppContext>();
  app.use('*', requestContext(opts));
  app.use('*', corsFromEnv);
  app.use('*', limitBody);

  const v1 = new Hono<AppContext>();
  for (const r of [healthRouter, authRouter, devicesRouter, pairingRouter, relationshipsRouter, medicationsRouter, syncRouter]) v1.route('/', r);
  app.route('/api/v1', v1);
  app.route('/', healthRouter);
  app.route('/', legalRouter);

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: c.get('requestId') } }, 404));
  app.onError((err, c) => {
    const requestId = c.get('requestId') ?? 'unknown';
    if (err instanceof AppError) {
      if (err.headers) for (const [k, v] of Object.entries(err.headers)) c.header(k, v);
      return c.json(
        { error: { code: err.code, message: err.message, requestId, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) } },
        err.status,
      );
    }
    // Never leak internals: log only the error class.
    log('error', 'unhandled_error', { requestId, errorCode: err?.name ?? 'Error' });
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId } }, 500);
  });
  return app;
}

const app = createApp();
// The Hono instance is the default export (so `app.request()` works in tests) and also carries the cron handler.
export default Object.assign(app, {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const svc = new Services(buildDeps(env, {}, (p) => ctx.waitUntil(p)));
    ctx.waitUntil(svc.maintenance().catch(() => log('error', 'maintenance_failed')));
  },
});
export { app };
