import type { FallbackPolicy } from '@medchain/contracts';
import { zonedDateTimeToUtc } from './date-utils';

export interface DependentEvaluationResult {
  action: 'SCHEDULE' | 'DO_NOTHING' | 'SKIP_CHILD';
  scheduledAtUtc?: string;
  reason: string;
}

export function evaluateDependentDose(params: {
  parentAction: 'TAKEN' | 'SNOOZED' | 'SKIPPED';
  parentActionTimestamp: string; // ISO 8601
  parentScheduledDate: string;   // 'YYYY-MM-DD'
  delayMinutes: number;
  fallbackPolicy?: FallbackPolicy | null;
  fallbackTime?: string | null;  // 'HH:MM'
  timezoneId: string;
}): DependentEvaluationResult {
  const { parentAction, parentActionTimestamp, parentScheduledDate, delayMinutes, fallbackPolicy, fallbackTime, timezoneId } = params;

  if (parentAction === 'SNOOZED') {
    // Snooze protection: snoozing a parent dose MUST NOT start the dependent countdown
    return {
      action: 'DO_NOTHING',
      reason: 'Parent dose snoozed; dependent countdown has not started.',
    };
  }

  if (parentAction === 'TAKEN') {
    const parentTime = new Date(parentActionTimestamp).getTime();
    const childScheduledTime = new Date(parentTime + delayMinutes * 60 * 1000);
    return {
      action: 'SCHEDULE',
      scheduledAtUtc: childScheduledTime.toISOString(),
      reason: `Parent dose taken. Child scheduled ${delayMinutes} minutes later.`,
    };
  }

  if (parentAction === 'SKIPPED') {
    if (fallbackPolicy === 'USE_FALLBACK_TIME' && fallbackTime) {
      // Fallback time is a local wall-clock time on the parent's scheduled local date
      const fallbackIso = zonedDateTimeToUtc(parentScheduledDate, fallbackTime, timezoneId);
      return {
        action: 'SCHEDULE',
        scheduledAtUtc: fallbackIso,
        reason: `Parent dose skipped. Using prescribed fallback time of ${fallbackTime}.`,
      };
    }

    return {
      action: 'SKIP_CHILD',
      reason: 'Parent dose skipped with skip-child policy.',
    };
  }

  return {
    action: 'DO_NOTHING',
    reason: 'Unrecognized parent action.',
  };
}
