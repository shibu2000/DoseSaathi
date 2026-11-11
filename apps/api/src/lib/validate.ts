import type { Context } from 'hono';
import type { ZodTypeAny, z } from 'zod';
import { AppError, validation, type FieldError } from './errors';

function issues(prefix: string, err: z.ZodError): FieldError[] {
  return err.issues.slice(0, 20).map((i) => ({
    field: [prefix, ...i.path].join('.'),
    message: i.message,
  }));
}

export async function parseBody<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    const text = await c.req.text();
    raw = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw validation(issues('body', r.error));
  return r.data;
}

export function parseQuery<S extends ZodTypeAny>(c: Context, schema: S): z.output<S> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw validation(issues('query', r.error));
  return r.data;
}

export function parseParam(c: Context, name: string, schema: ZodTypeAny): string {
  const r = schema.safeParse(c.req.param(name));
  if (!r.success) throw validation([{ field: `params.${name}`, message: 'Invalid identifier' }]);
  return r.data as string;
}
