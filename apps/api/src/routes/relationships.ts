import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../env';
import { parseBody, parseParam } from '../lib/validate';
import { RestrictPermissionsRequestSchema } from '@medchain/contracts';
import { requireCaregiver, requireDevice, requireRelationshipAccess } from '../middleware/auth';
import { toSummary } from '../services/relationships';

const uuid = z.string().uuid();
export const relationshipsRouter = new Hono<AppContext>();

relationshipsRouter.get('/relationships', requireCaregiver, async (c) =>
  c.json({ items: await c.get('svc').relationships.listForCaregiver(c.get('caregiver')!.id) }));
relationshipsRouter.get('/relationships/:id', requireCaregiver, requireRelationshipAccess(null), (c) =>
  c.json({ relationship: toSummary(c.get('relationship')!) }));
relationshipsRouter.delete('/relationships/:id', requireCaregiver, requireRelationshipAccess(null, { allowInactive: true }), async (c) =>
  c.json({ status: await c.get('svc').relationships.disconnect(c.get('relationship')!) }));

relationshipsRouter.get('/patient/relationships', requireDevice, async (c) =>
  c.json({ items: await c.get('svc').relationships.listForDevice(c.get('device')!.id) }));
relationshipsRouter.post('/patient/relationships/:id/revoke', requireDevice, async (c) =>
  c.json({ status: await c.get('svc').relationships.revokeByPatient(c.get('device')!.id, parseParam(c, 'id', uuid)) }));
relationshipsRouter.patch('/patient/relationships/:id', requireDevice, async (c) => {
  const id = parseParam(c, 'id', uuid);
  const body = await parseBody(c, RestrictPermissionsRequestSchema);
  return c.json({ relationship: await c.get('svc').relationships.restrict(c.get('device')!.id, id, body.permissions) });
});
