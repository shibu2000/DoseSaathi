import type { DatabaseConnection } from '../types';
import type { CourseTransitionEvent } from '@medchain/domain';

export class CourseTransitionRepository {
  constructor(private db: DatabaseConnection) {}

  async recordTransition(event: CourseTransitionEvent): Promise<void> {
    await this.db.run(
      `INSERT INTO course_transition_events (
        id, source_course_id, activated_medication_ids_json, prior_states_json,
        transition_timestamp, undo_until, undone_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL);`,
      [
        event.id,
        event.sourceCourseId,
        JSON.stringify(event.activatedMedicationIds),
        JSON.stringify({
          parent: event.priorParentState,
          children: event.priorChildStates,
        }),
        event.transitionTimestamp,
        event.undoUntil,
      ]
    );
  }

  async getLatestForCourse(courseId: string): Promise<CourseTransitionEvent | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM course_transition_events
       WHERE source_course_id = ? AND undone_at IS NULL
       ORDER BY transition_timestamp DESC LIMIT 1;`,
      [courseId]
    );

    if (!row) return null;

    let priorStates = { parent: { lifecycleStatus: 'ACTIVE', dosesTakenCount: 0 }, children: {} };
    try {
      priorStates = JSON.parse(row.prior_states_json);
    } catch {}

    let activatedMedicationIds: string[] = [];
    try {
      activatedMedicationIds = JSON.parse(row.activated_medication_ids_json);
    } catch {}

    return {
      id: row.id,
      sourceCourseId: row.source_course_id,
      activatedMedicationIds,
      priorParentState: priorStates.parent as any,
      priorChildStates: priorStates.children as any,
      transitionTimestamp: row.transition_timestamp,
      undoUntil: row.undo_until,
    };
  }

  async markUndone(eventId: string, undoneAtUtc: string): Promise<void> {
    await this.db.run(
      `UPDATE course_transition_events SET undone_at = ? WHERE id = ?;`,
      [undoneAtUtc, eventId]
    );
  }
}
