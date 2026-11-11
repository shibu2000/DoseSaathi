import type { DatabaseConnection } from '../types';
import type { Schedule } from '@medchain/contracts';

export class ScheduleRepository {
  constructor(private db: DatabaseConnection) {}

  async create(schedule: Schedule): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      await tx.run(
        `INSERT INTO medication_schedules (
          id, medication_id, schedule_type, recurrence_type, start_date,
          timezone_id, interval_hours, interval_first_time, cycle_days_on,
          cycle_days_off, cycle_anchor_date, active_weekdays_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          schedule.id,
          schedule.medicationId,
          schedule.scheduleType,
          schedule.recurrenceType,
          schedule.startDate,
          schedule.timezoneId,
          schedule.intervalHours ?? null,
          schedule.intervalFirstTime ?? null,
          schedule.cycleDaysOn ?? null,
          schedule.cycleDaysOff ?? null,
          schedule.cycleAnchorDate ?? null,
          JSON.stringify(schedule.activeWeekdays ?? []),
          schedule.createdAt,
          schedule.updatedAt,
        ]
      );

      // Insert fixed times
      if (schedule.fixedTimes && schedule.fixedTimes.length > 0) {
        for (let i = 0; i < schedule.fixedTimes.length; i++) {
          const timeId = `${schedule.id}_time_${i}`;
          await tx.run(
            `INSERT INTO schedule_times (id, schedule_id, local_time, ordinal)
             VALUES (?, ?, ?, ?);`,
            [timeId, schedule.id, schedule.fixedTimes[i], i]
          );
        }
      }
    });
  }

  async getByMedicationId(medicationId: string): Promise<Schedule | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM medication_schedules WHERE medication_id = ?;`,
      [medicationId]
    );

    if (!row) return null;

    const timeRows = await this.db.all<{ local_time: string }>(
      `SELECT local_time FROM schedule_times WHERE schedule_id = ? ORDER BY ordinal ASC;`,
      [row.id]
    );

    let activeWeekdays: number[] = [];
    if (row.active_weekdays_json) {
      try {
        activeWeekdays = JSON.parse(row.active_weekdays_json);
      } catch {
        activeWeekdays = [];
      }
    }

    return {
      id: row.id,
      medicationId: row.medication_id,
      scheduleType: row.schedule_type,
      recurrenceType: row.recurrence_type,
      startDate: row.start_date,
      timezoneId: row.timezone_id,
      fixedTimes: timeRows.map((t) => t.local_time),
      activeWeekdays,
      cycleDaysOn: row.cycle_days_on ?? null,
      cycleDaysOff: row.cycle_days_off ?? null,
      cycleAnchorDate: row.cycle_anchor_date ?? null,
      intervalHours: row.interval_hours ?? null,
      intervalFirstTime: row.interval_first_time ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getAll(): Promise<Schedule[]> {
    const rows = await this.db.all<any>(`SELECT * FROM medication_schedules;`);
    const allTimes = await this.db.all<{ schedule_id: string; local_time: string }>(
      `SELECT schedule_id, local_time FROM schedule_times ORDER BY schedule_id, ordinal ASC;`
    );
    const timesBySchedule = new Map<string, string[]>();
    for (const t of allTimes) {
      const arr = timesBySchedule.get(t.schedule_id) || [];
      arr.push(t.local_time);
      timesBySchedule.set(t.schedule_id, arr);
    }

    return rows.map((row) => {
      let activeWeekdays: number[] = [];
      if (row.active_weekdays_json) {
        try {
          activeWeekdays = JSON.parse(row.active_weekdays_json);
        } catch {
          activeWeekdays = [];
        }
      }

      return {
        id: row.id,
        medicationId: row.medication_id,
        scheduleType: row.schedule_type,
        recurrenceType: row.recurrence_type,
        startDate: row.start_date,
        timezoneId: row.timezone_id,
        fixedTimes: timesBySchedule.get(row.id) || [],
        activeWeekdays,
        cycleDaysOn: row.cycle_days_on ?? null,
        cycleDaysOff: row.cycle_days_off ?? null,
        cycleAnchorDate: row.cycle_anchor_date ?? null,
        intervalHours: row.interval_hours ?? null,
        intervalFirstTime: row.interval_first_time ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async deleteByMedicationId(medicationId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM schedule_times WHERE schedule_id IN (SELECT id FROM medication_schedules WHERE medication_id = ?);`,
      [medicationId]
    );
    await this.db.run(
      `DELETE FROM medication_schedules WHERE medication_id = ?;`,
      [medicationId]
    );
  }
}
