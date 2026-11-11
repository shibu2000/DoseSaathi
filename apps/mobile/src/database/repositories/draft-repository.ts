import type { DatabaseConnection } from '../types';
import type { ScheduleType, RecurrenceType, CourseType } from '@medchain/contracts';

export interface WizardDraft {
  id?: string;
  // Step 1: Medication Details & Stock
  name: string;
  dosageText: string;
  doseQuantity: number;
  doseUnit: string;
  instructions: string;
  trackStock: boolean;
  currentStock: number;
  lowStockThreshold: number;

  // Step 2: Reminder Schedule
  scheduleType: ScheduleType;
  recurrenceType: RecurrenceType;
  fixedTimes: string[];
  activeWeekdays: number[];
  intervalHours: number;
  intervalFirstTime: string;
  cycleDaysOn: number;
  cycleDaysOff: number;
  cycleAnchorDate?: string;
  sameDayParentMedicationId?: string;
  sameDayDelayMinutes: number;
  sameDayFallbackPolicy?: 'SKIP_CHILD' | 'USE_FALLBACK_TIME';
  sameDayFallbackTime?: string;

  // Step 3: Treatment Duration & Course Dependency
  courseType: CourseType;
  maxDurationDays?: number;
  maxTotalDoses?: number;
  courseStartAt?: string;
  hasPrerequisiteCourse: boolean;
  prerequisiteMedicationId?: string;
  phaseDelayHours: number;

  // Navigation & Edit state
  currentStep: number;
  editingMedicationId?: string;
}

export const DEFAULT_WIZARD_DRAFT: WizardDraft = {
  name: '',
  dosageText: '',
  doseQuantity: 1,
  doseUnit: 'tablet',
  instructions: '',
  trackStock: false,
  currentStock: 30,
  lowStockThreshold: 5,
  scheduleType: 'FIXED_TIMES',
  recurrenceType: 'DAILY',
  fixedTimes: ['08:00'],
  activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
  intervalHours: 6,
  intervalFirstTime: '08:00',
  cycleDaysOn: 21,
  cycleDaysOff: 7,
  sameDayDelayMinutes: 30,
  sameDayFallbackPolicy: 'SKIP_CHILD',
  courseType: 'ONGOING',
  hasPrerequisiteCourse: false,
  phaseDelayHours: 0,
  currentStep: 1,
};

const DRAFT_KEY = 'active_wizard_draft';

export class DraftRepository {
  constructor(private db: DatabaseConnection) {}

  async saveDraft(draft: WizardDraft): Promise<void> {
    const now = new Date().toISOString();
    const draftJson = JSON.stringify(draft);
    await this.db.run(
      `INSERT INTO wizard_drafts (id, draft_json, current_step, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         draft_json = excluded.draft_json,
         current_step = excluded.current_step,
         updated_at = excluded.updated_at;`,
      [DRAFT_KEY, draftJson, draft.currentStep, now]
    );
  }

  async getDraft(): Promise<WizardDraft | null> {
    const row = await this.db.get<{ draft_json: string; current_step: number }>(
      `SELECT draft_json, current_step FROM wizard_drafts WHERE id = ?;`,
      [DRAFT_KEY]
    );
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.draft_json) as WizardDraft;
      parsed.currentStep = row.current_step;
      return parsed;
    } catch {
      return null;
    }
  }

  async clearDraft(): Promise<void> {
    await this.db.run(`DELETE FROM wizard_drafts WHERE id = ?;`, [DRAFT_KEY]);
  }
}
