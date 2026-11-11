import type { Medication } from '@medchain/contracts';
import type { CourseTransitionEvent } from './fanout';

export interface UndoTransitionResult {
  success: boolean;
  reason?: string;
  restoredParent?: Medication;
  restoredChildren?: Medication[];
}

export function undoCourseTransition(params: {
  transitionEvent: CourseTransitionEvent;
  currentTimestampUtc: string; // ISO 8601 UTC
  currentParent: Medication;
  currentChildren: Medication[];
}): UndoTransitionResult {
  const { transitionEvent, currentTimestampUtc, currentParent, currentChildren } = params;

  const nowMs = new Date(currentTimestampUtc).getTime();
  const undoLimitMs = new Date(transitionEvent.undoUntil).getTime();

  if (nowMs > undoLimitMs) {
    return {
      success: false,
      reason: 'The 5-minute undo window for this course transition has expired.',
    };
  }

  // Restore parent
  const restoredParent: Medication = {
    ...currentParent,
    lifecycleStatus: transitionEvent.priorParentState.lifecycleStatus,
    updatedAt: currentTimestampUtc,
  };

  // Restore children
  const restoredChildren: Medication[] = currentChildren.map((child) => {
    const priorStatus = transitionEvent.priorChildStates[child.id] ?? 'QUEUED_PHASE';
    return {
      ...child,
      lifecycleStatus: priorStatus,
      updatedAt: currentTimestampUtc,
    };
  });

  return {
    success: true,
    restoredParent,
    restoredChildren,
  };
}
