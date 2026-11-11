import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../env';
import { unauthenticated, notFound } from '../lib/errors';
import type { PermissionKey } from '@medchain/contracts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requireCaregiver: MiddlewareHandler<AppContext> = async (c, next) => {
  const m = c.req.header('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{20,2048})$/);
  if (!m) throw unauthenticated();
  c.set('caregiver', await c.get('svc').auth.verifyAccessToken(m[1]!));
  await next();
};

export const requireDevice: MiddlewareHandler<AppContext> = async (c, next) => {
  c.set('device', await c.get('svc').devices.authenticate(c.req.header('Authorization')));
  await next();
};

/**
 * Must follow requireCaregiver. Resolves `:id` as a relationship the caregiver participates in
 * (404 otherwise), requires it ACTIVE and, optionally, a specific permission.
 */
export const requireRelationshipAccess = (
  permission: PermissionKey | null,
  opts: { allowInactive?: boolean } = {},
): MiddlewareHandler<AppContext> => async (c, next) => {
  const id = c.req.param('id') ?? '';
  if (!UUID_RE.test(id)) throw notFound();
  const row = await c
    .get('svc')
    .relationships.resolveForCaregiver(id, c.get('caregiver')!.id, permission, opts.allowInactive ?? false);
  c.set('relationship', row);
  await next();
};
