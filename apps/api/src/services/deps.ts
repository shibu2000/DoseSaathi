import type { Env } from '../env';
import type { PushDispatcher } from './push/dispatcher';

export interface Deps {
  db: D1Database;
  env: Env;
  now: () => Date;
  uuid: () => string;
  push: PushDispatcher;
  /** Run background work after the response (ctx.waitUntil in Workers). */
  schedule: (p: Promise<unknown>) => void;
}

export const isUniqueViolation = (e: unknown): boolean => /UNIQUE|constraint/i.test(String((e as Error)?.message ?? ''));
