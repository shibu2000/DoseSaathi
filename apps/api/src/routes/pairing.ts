import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../env';
import { parseBody, parseParam } from '../lib/validate';
import {
  ApprovePairingV2Schema, CreatePairingRequestSchema, PairingCodeSchema, PairingSecretSchema, PermissionSetSchema, ValidatePairingRequestSchema,
} from '@medchain/contracts';
import { requireCaregiver, requireDevice } from '../middleware/auth';
import { clientIp } from '../middleware/context';

const uuid = z.string().uuid();
const PathRequestSchema = z.intersection(
  z.union([z.object({ code: PairingCodeSchema }), z.object({ secret: PairingSecretSchema })]),
  z.object({ requestedPermissions: PermissionSetSchema }),
);

export const pairingRouter = new Hono<AppContext>();

// patient device
pairingRouter.post('/pairing/sessions', requireDevice, async (c) =>
  c.json(await c.get('svc').pairing.createSession(c.get('device')!), 201));
pairingRouter.get('/pairing/sessions/:sessionId', requireDevice, async (c) =>
  c.json(await c.get('svc').pairing.getSession(c.get('device')!, parseParam(c, 'sessionId', uuid))));
pairingRouter.post('/pairing/sessions/:sessionId/regenerate', requireDevice, async (c) =>
  c.json(await c.get('svc').pairing.regenerate(c.get('device')!, parseParam(c, 'sessionId', uuid)), 201));
pairingRouter.post('/pairing/requests/:requestId/approve', requireDevice, async (c) => {
  const id = parseParam(c, 'requestId', uuid);
  const body = await parseBody(c, ApprovePairingV2Schema);
  return c.json(await c.get('svc').pairing.approve(c.get('device')!, id, body));
});
pairingRouter.post('/pairing/requests/:requestId/decline', requireDevice, async (c) =>
  c.json(await c.get('svc').pairing.decline(c.get('device')!, parseParam(c, 'requestId', uuid))));

// caregiver
pairingRouter.post('/pairing/validate', requireCaregiver, async (c) => {
  const body = await parseBody(c, ValidatePairingRequestSchema);
  return c.json(await c.get('svc').pairing.validate(c.get('caregiver')!, body, clientIp(c)));
});
pairingRouter.post('/pairing/requests', requireCaregiver, async (c) => {
  const body = await parseBody(c, CreatePairingRequestSchema);
  const cred = 'code' in body ? { code: body.code } : { sessionId: body.sessionId, secret: body.secret };
  return c.json(await c.get('svc').pairing.createRequest(c.get('caregiver')!, cred, body.requestedPermissions, clientIp(c)), 201);
});
pairingRouter.post('/pairing/sessions/:sessionId/requests', requireCaregiver, async (c) => {
  const sessionId = parseParam(c, 'sessionId', uuid);
  const body = await parseBody(c, PathRequestSchema);
  const cred = 'code' in body ? { code: body.code } : { sessionId, secret: body.secret };
  return c.json(await c.get('svc').pairing.createRequest(c.get('caregiver')!, cred, body.requestedPermissions, clientIp(c), sessionId), 201);
});
pairingRouter.get('/pairing/requests/:requestId/status', requireCaregiver, async (c) =>
  c.json(await c.get('svc').pairing.requestStatus(c.get('caregiver')!, parseParam(c, 'requestId', uuid))));
pairingRouter.delete('/pairing/requests/:requestId', requireCaregiver, async (c) =>
  c.json(await c.get('svc').pairing.cancelRequest(c.get('caregiver')!, parseParam(c, 'requestId', uuid))));
