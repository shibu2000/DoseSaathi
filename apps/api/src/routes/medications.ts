import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../env';
import { parseBody, parseParam, parseQuery } from '../lib/validate';
import { AppError, conflict, notFound } from '../lib/errors';
import { MedicationCreateRequestSchema, MedicationPatchRequestSchema, SubmitPlanCommandV2Schema } from '@medchain/contracts';
import { requireCaregiver, requireRelationshipAccess } from '../middleware/auth';

const uuid = z.string().uuid();
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const view = requireRelationshipAccess('VIEW_SCHEDULE');
const edit = requireRelationshipAccess('EDIT_SCHEDULE');

function idempotencyKey(headerValue: string | undefined, bodyCommandId?: string): string {
  if (headerValue !== undefined && !KEY_RE.test(headerValue)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'header.Idempotency-Key', message: 'Must be 8-128 URL-safe characters' }]);
  }
  if (headerValue && bodyCommandId && headerValue !== bodyCommandId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'header.Idempotency-Key', message: 'Must equal body.commandId when both are sent' }]);
  }
  return headerValue ?? bodyCommandId ?? `auto:${crypto.randomUUID()}`;
}

export const medicationsRouter = new Hono<AppContext>();

medicationsRouter.get('/relationships/:id/medications', requireCaregiver, view, async (c) =>
  c.json(await c.get('svc').plans.readPlan(c.get('relationship')!)));
medicationsRouter.get('/relationships/:id/medications/:medicationId', requireCaregiver, view, async (c) =>
  c.json(await c.get('svc').plans.getMedication(c.get('relationship')!, parseParam(c, 'medicationId', uuid))));

medicationsRouter.post('/relationships/:id/medications', requireCaregiver, edit, async (c) => {
  const body = await parseBody(c, MedicationCreateRequestSchema);
  const key = idempotencyKey(c.req.header('Idempotency-Key'));
  const out = await c.get('svc').plans.mutate(c.get('relationship')!, key, body.baseVersion, (meds) => {
    if (meds.some((m) => m.id === body.medication.id)) throw conflict('CONFLICT', 'Medication already exists.');
    return { meds: [...meds, body.medication], removed: [] };
  });
  return c.json(out, 202);
});
medicationsRouter.patch('/relationships/:id/medications/:medicationId', requireCaregiver, edit, async (c) => {
  const medId = parseParam(c, 'medicationId', uuid);
  const body = await parseBody(c, MedicationPatchRequestSchema);
  const key = idempotencyKey(c.req.header('Idempotency-Key'));
  const out = await c.get('svc').plans.mutate(c.get('relationship')!, key, body.baseVersion, (meds) => {
    if (!meds.some((m) => m.id === medId)) throw notFound('Medication not found.');
    return { meds: meds.map((m) => (m.id === medId ? { ...m, ...body.medication } : m)), removed: [] };
  });
  return c.json(out, 202);
});
medicationsRouter.delete('/relationships/:id/medications/:medicationId', requireCaregiver, edit, async (c) => {
  const medId = parseParam(c, 'medicationId', uuid);
  const q = parseQuery(c, z.object({ baseVersion: z.coerce.number().int().nonnegative() }));
  const key = idempotencyKey(c.req.header('Idempotency-Key'));
  const out = await c.get('svc').plans.mutate(c.get('relationship')!, key, q.baseVersion, (meds) => {
    if (!meds.some((m) => m.id === medId)) throw notFound('Medication not found.');
    return { meds: meds.filter((m) => m.id !== medId), removed: [medId] };
  });
  return c.json(out, 202);
});

medicationsRouter.post('/relationships/:id/plan-commands', requireCaregiver, edit, async (c) => {
  const body = await parseBody(c, SubmitPlanCommandV2Schema);
  const key = idempotencyKey(c.req.header('Idempotency-Key'), body.commandId);
  return c.json(await c.get('svc').plans.submitCommand(c.get('relationship')!, { key, baseVersion: body.baseVersion, snapshot: body.planSnapshot }), 202);
});
medicationsRouter.get('/relationships/:id/plan-commands/:commandId', requireCaregiver, view, async (c) =>
  c.json(await c.get('svc').plans.commandState(c.get('relationship')!, parseParam(c, 'commandId', uuid))));
