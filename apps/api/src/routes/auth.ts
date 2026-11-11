import { Hono } from 'hono';
import type { AppContext } from '../env';
import { parseBody } from '../lib/validate';
import { LoginRequestSchema, RefreshRequestSchema, RegisterCaregiverRequestSchema } from '@medchain/contracts';
import { z } from 'zod';
import { requireCaregiver } from '../middleware/auth';
import { clientIp } from '../middleware/context';

export const authRouter = new Hono<AppContext>();

authRouter.post('/auth/register', async (c) => {
  const body = await parseBody(c, RegisterCaregiverRequestSchema);
  return c.json(await c.get('svc').auth.register(body, clientIp(c)), 201);
});
authRouter.post('/auth/login', async (c) => {
  const body = await parseBody(c, LoginRequestSchema);
  return c.json(await c.get('svc').auth.login(body, clientIp(c)));
});
authRouter.post('/auth/refresh', async (c) => {
  const body = await parseBody(c, RefreshRequestSchema);
  return c.json(await c.get('svc').auth.refresh(body.refreshToken, clientIp(c)));
});
authRouter.post('/auth/logout', async (c) => {
  const body = await parseBody(c, RefreshRequestSchema);
  await c.get('svc').auth.logout(body.refreshToken);
  return c.json({ ok: true });
});
authRouter.get('/auth/me', requireCaregiver, (c) => c.json({ caregiver: c.get('caregiver') }));

const DeleteAccountSchema = z.object({ password: z.string().min(1).max(128) });
/** Permanently deletes the signed-in caregiver's account and its server data. */
authRouter.delete('/auth/me', requireCaregiver, async (c) => {
  const body = await parseBody(c, DeleteAccountSchema);
  await c.get('svc').auth.deleteAccount(c.get('caregiver')!, body.password, clientIp(c));
  return c.json({ ok: true, deleted: true });
});
