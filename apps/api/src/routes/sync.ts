import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../env';
import { parseBody, parseQuery } from '../lib/validate';
import { UploadDoseEventsRequestSchema } from '@medchain/contracts';
import { requireCaregiver, requireDevice, requireRelationshipAccess } from '../middleware/auth';

export const syncRouter = new Hono<AppContext>();

syncRouter.post('/sync/dose-events', requireDevice, async (c) => {
  const body = await parseBody(c, UploadDoseEventsRequestSchema);
  return c.json(await c.get('svc').sync.upload(c.get('device')!, body.events));
});

syncRouter.get('/relationships/:id/activity', requireCaregiver, requireRelationshipAccess('VIEW_DOSE_LOGS'), async (c) => {
  const q = parseQuery(c, z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(200).optional() }));
  return c.json(await c.get('svc').sync.activity(c.get('relationship')!, q.limit, q.cursor));
});
