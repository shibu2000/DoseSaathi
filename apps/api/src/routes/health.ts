import { Hono } from 'hono';
import type { AppContext } from '../env';

export const API_VERSION = '2.0.0';
export const healthRouter = new Hono<AppContext>();

healthRouter.get('/health', async (c) => {
  let db: 'ok' | 'error' = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch {
    db = 'error';
  }
  return c.json(
    { status: db === 'ok' ? 'ok' : 'degraded', version: API_VERSION, timestamp: new Date().toISOString(), checks: { db } },
    db === 'ok' ? 200 : 503,
  );
});
