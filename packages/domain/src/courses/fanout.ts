import type { Medication } from '@medchain/contracts';

export interface CourseDependencyLink {
  parentMedicationId: string;
  childMedicationId: string;
  phaseDelayHours?: number;
}

export interface CourseTransitionEvent {
  id: string;
  sourceCourseId: string;
  activatedMedicationIds: string[];
  priorParentState: {
    lifecycleStatus: Medication['lifecycleStatus'];
    dosesTakenCount: number;
  };
  priorChildStates: Record<string, Medication['lifecycleStatus']>;
  transitionTimestamp: string; // ISO 8601 UTC
  undoUntil: string;           // transitionTimestamp + 5 minutes
}

export interface CourseCompletionResult {
  updatedParent: Medication;
  activatedChildren: Medication[];
  transitionEvent: CourseTransitionEvent;
}

export function completeCourseAndFanOut(params: {
  parentMedication: Medication;
  queuedChildren: Medication[];
  dependencyLinks: CourseDependencyLink[];
  completionTimestampUtc: string; // ISO 8601 UTC
  transitionEventId: string;
}): CourseCompletionResult {
  const {
    parentMedication,
    queuedChildren,
    dependencyLinks,
    completionTimestampUtc,
    transitionEventId,
  } = params;

  // Mark parent course COMPLETED
  const updatedParent: Medication = {
    ...parentMedication,
    lifecycleStatus: 'COMPLETED',
    updatedAt: completionTimestampUtc,
  };

  const priorChildStates: Record<string, Medication['lifecycleStatus']> = {};
  const activatedChildren: Medication[] = [];

  const completionTimeMs = new Date(completionTimestampUtc).getTime();
  const undoUntilMs = completionTimeMs + 5 * 60 * 1000; // 5-minute window

  for (const child of queuedChildren) {
    priorChildStates[child.id] = child.lifecycleStatus;

    const link = dependencyLinks.find(
      (l) => l.parentMedicationId === parentMedication.id && l.childMedicationId === child.id
    );
    const delayHours = link?.phaseDelayHours ?? 0;
    const effectiveStartMs = completionTimeMs + delayHours * 60 * 60 * 1000;

    activatedChildren.push({
      ...child,
      lifecycleStatus: 'ACTIVE',
      courseStartAt: new Date(effectiveStartMs).toISOString(),
      updatedAt: completionTimestampUtc,
    });
  }

  const transitionEvent: CourseTransitionEvent = {
    id: transitionEventId,
    sourceCourseId: parentMedication.id,
    activatedMedicationIds: activatedChildren.map((c) => c.id),
    priorParentState: {
      lifecycleStatus: parentMedication.lifecycleStatus,
      dosesTakenCount: parentMedication.dosesTakenCount,
    },
    priorChildStates,
    transitionTimestamp: completionTimestampUtc,
    undoUntil: new Date(undoUntilMs).toISOString(),
  };

  return {
    updatedParent,
    activatedChildren,
    transitionEvent,
  };
}
