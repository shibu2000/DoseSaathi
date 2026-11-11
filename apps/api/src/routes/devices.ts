import { Hono } from 'hono';
import type { AppContext } from '../env';
import { parseBody, parseQuery } from '../lib/validate';
import {
  PatchDeviceRequestSchema, RegisterDeviceRequestSchema, UploadDevicePlanRequestSchema, DeviceAcksRequestSchema,
} from '@medchain/contracts';
import { requireDevice } from '../middleware/auth';
import { clientIp } from '../middleware/context';
import { z } from 'zod';

export const devicesRouter = new Hono<AppContext>();

devicesRouter.post('/devices/register', async (c) => {
  const body = await parseBody(c, RegisterDeviceRequestSchema);
  const svc = c.get('svc');
  if (c.req.header('Authorization')) {
    const device = await svc.devices.authenticate(c.req.header('Authorization')); // invalid => 401, never a new identity
    return c.json(await svc.devices.refreshRegistration(device, body), 200);
  }
  return c.json(await svc.devices.register(body, clientIp(c)), 201);
});

devicesRouter.get('/devices/current', requireDevice, async (c) => c.json(await c.get('svc').devices.profile(c.get('device')!.id)));
devicesRouter.patch('/devices/current', requireDevice, async (c) => {
  const body = await parseBody(c, PatchDeviceRequestSchema);
  return c.json(await c.get('svc').devices.update(c.get('device')!, body));
});
devicesRouter.delete('/devices/current', requireDevice, async (c) => {
  // ?purge=true erases all server data for this device instead of only unregistering it
  if (c.req.query('purge') === 'true') {
    await c.get('svc').devices.purge(c.get('device')!);
    return c.json({ ok: true, purged: true });
  }
  await c.get('svc').devices.remove(c.get('device')!);
  return c.json({ ok: true });
});

devicesRouter.put('/devices/current/plan', requireDevice, async (c) => {
  const body = await parseBody(c, UploadDevicePlanRequestSchema);
  return c.json(await c.get('svc').plans.uploadDeviceReport(c.get('device')!, body.baseVersion, body.report));
});
devicesRouter.get('/devices/current/changes', requireDevice, async (c) => {
  const q = parseQuery(c, z.object({ cursor: z.string().regex(/^\d{1,15}$/).optional() }));
  return c.json(await c.get('svc').plans.changes(c.get('device')!, q.cursor));
});
devicesRouter.post('/devices/current/acks', requireDevice, async (c) => {
  const body = await parseBody(c, DeviceAcksRequestSchema);
  return c.json(await c.get('svc').plans.acks(c.get('device')!, body.acks, body.cursor));
});
