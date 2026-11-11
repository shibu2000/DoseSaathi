import type { PlanSnapshotV2 } from '@medchain/contracts';
import { ApiError, type ApiClient } from '../sync/api-client';
import {
  baseFromPlanState,
  validateSnapshot,
  PlanValidationError,
  type PlanBase,
  type PlanIssue,
} from './plan-composer';

export type PlanApi = Pick<ApiClient, 'getPlan' | 'submitPlanCommand'>;

export interface SubmitResult {
  commandId: string;
  status: string;
  planVersion: number;
  snapshot: PlanSnapshotV2;
}

export class PlanConflictError extends Error {
  constructor() {
    super('The plan changed while you were editing. Please review it and try again.');
    this.name = 'PlanConflictError';
  }
}

/**
 * Fetches the latest plan, composes the snapshot on top of it, validates, and submits with
 * `baseVersion = latestPlanVersion`. On 409 PLAN_VERSION_CONFLICT it re-fetches, re-composes and
 * retries once; a second conflict is surfaced as `PlanConflictError`.
 *
 * `compose` receives the freshest base and returns the snapshot (it may throw PlanValidationError).
 * `idempotencyKey` should be created once per user "send" intent so retries after a network failure replay safely.
 */
export async function submitComposedPlan(
  api: PlanApi,
  relationshipId: string,
  compose: (base: PlanBase) => PlanSnapshotV2,
  idempotencyKey: string
): Promise<SubmitResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const plan = await api.getPlan(relationshipId);
    const snapshot = compose(baseFromPlanState(plan));
    const issues: PlanIssue[] = validateSnapshot(snapshot);
    if (issues.length > 0) throw new PlanValidationError(issues);
    // A conflict creates nothing on the server, but the body differs after a rebase, so use a fresh key for the retry.
    const key = attempt === 0 ? idempotencyKey : `${idempotencyKey}-r${attempt}`;
    try {
      const res = await api.submitPlanCommand(
        relationshipId,
        { baseVersion: plan.latestPlanVersion, planSnapshot: snapshot },
        key
      );
      return { commandId: res.commandId, status: res.status, planVersion: res.planVersion, snapshot };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_VERSION_CONFLICT') {
        continue;
      }
      throw err;
    }
  }
  throw new PlanConflictError();
}

/** User-facing message for any failure of `submitComposedPlan`. */
export function describeSubmitError(err: unknown): string {
  if (err instanceof PlanValidationError) return err.issues[0]?.message ?? err.message;
  if (err instanceof PlanConflictError) return err.message;
  if (err instanceof ApiError) {
    if (err.isNetwork) return "Couldn't reach DoseSaathi. Check your connection and try again. Nothing was sent.";
    if (err.code === 'PERMISSION_DENIED') return 'You do not have permission to change this person\'s medicines.';
    if (err.code === 'RELATIONSHIP_INACTIVE') return 'This connection has ended, so changes cannot be sent.';
    if (err.code === 'PAYLOAD_TOO_LARGE') return 'This plan is too large to send. Remove a medicine or shorten the instructions.';
    if (err.code === 'SESSION_EXPIRED' || err.code === 'NOT_SIGNED_IN' || err.code === 'UNAUTHENTICATED') {
      return 'Your sign-in has expired. Please sign in again.';
    }
    return err.message || 'The server did not accept this change.';
  }
  return 'Something went wrong. Nothing was sent.';
}
