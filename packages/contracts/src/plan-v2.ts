import { z } from 'zod';
import { CourseTypeSchema, LifecycleStatusSchema } from './medications';
import { ScheduleTypeSchema, RecurrenceTypeSchema } from './schedules';

/**
 * Plan snapshot v2: the unit of exchange between a caregiver and the patient's device.
 *
 * It describes the *prescription* (what to take, when, for how long, in which order) and never the
 * device's *progress* (confirmed dose count, current lifecycle state, stock on hand, course start
 * time). Those are owned by the patient's device and are only ever reported back to the caregiver.
 * That separation is what lets a caregiver edit a plan mid-course without resetting the patient's
 * history, and it keeps the payload comfortably under the 4 KB target for typical prescriptions.
 */
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const PlanScheduleSchema = z.object({
  scheduleType: ScheduleTypeSchema,
  recurrenceType: RecurrenceTypeSchema,
  fixedTimes: z.array(HHMM).max(12).default([]),
  activeWeekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  intervalHours: z.number().int().min(1).max(24).optional(),
  intervalFirstTime: HHMM.optional(),
  cycleDaysOn: z.number().int().positive().optional(),
  cycleDaysOff: z.number().int().nonnegative().optional(),
  cycleAnchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PlanSchedule = z.infer<typeof PlanScheduleSchema>;

export const PlanMedicationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  dosageText: z.string().min(1).max(120),
  doseQuantity: z.number().positive().default(1),
  doseUnit: z.string().max(40).default('tablet'),
  instructions: z.string().max(500).optional(),
  courseType: CourseTypeSchema.default('ONGOING'),
  maxDurationDays: z.number().int().positive().nullable().optional(),
  maxTotalDoses: z.number().int().positive().nullable().optional(),
  trackStock: z.boolean().default(false),
  /** Starting quantity for NEW medicines only; the device owns the running stock afterwards. */
  initialStock: z.number().nonnegative().optional(),
  lowStockThreshold: z.number().nonnegative().default(5),
  schedule: PlanScheduleSchema,
  /** Same-day dependency: rings `delayMinutes` after the parent dose is marked Taken. */
  sameDay: z
    .object({
      parentMedicationId: z.string().uuid(),
      delayMinutes: z.number().int().min(1).max(24 * 60),
      fallbackPolicy: z.enum(['SKIP_CHILD', 'USE_FALLBACK_TIME']).optional(),
      fallbackTime: HHMM.optional(),
    })
    .optional(),
  /** Course dependency: stays queued until the prerequisite course completes. */
  startsAfter: z
    .object({
      prerequisiteMedicationId: z.string().uuid(),
      phaseDelayHours: z.number().int().min(0).max(24 * 30).default(0),
    })
    .optional(),
});
export type PlanMedication = z.infer<typeof PlanMedicationSchema>;

export const PlanSnapshotV2Schema = z.object({
  schemaVersion: z.literal(2),
  medications: z.array(PlanMedicationSchema).max(40),
  /** Medicines that were part of an earlier version and have been removed by the caregiver. */
  removedMedicationIds: z.array(z.string().uuid()).max(40).default([]),
});
export type PlanSnapshotV2 = z.infer<typeof PlanSnapshotV2Schema>;

/**
 * Device-reported state, uploaded with the device's own plan so a caregiver sees real progress
 * (lifecycle state, doses taken, stock) next to the prescription.
 */
export const DeviceMedicationStatusSchema = z.object({
  medicationId: z.string().uuid(),
  lifecycleStatus: LifecycleStatusSchema,
  dosesTakenCount: z.number().int().nonnegative(),
  currentStock: z.number().nonnegative().optional(),
  courseStartAt: z.string().datetime().optional(),
});
export type DeviceMedicationStatus = z.infer<typeof DeviceMedicationStatusSchema>;

export const DevicePlanReportSchema = z.object({
  schemaVersion: z.literal(2),
  medications: z.array(PlanMedicationSchema).max(40),
  status: z.array(DeviceMedicationStatusSchema).max(40),
});
export type DevicePlanReport = z.infer<typeof DevicePlanReportSchema>;
