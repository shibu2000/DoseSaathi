import { z } from 'zod';

export const ScheduleTypeSchema = z.enum([
  'FIXED_TIMES',
  'INTERVAL',
  'SAME_DAY_DEPENDENT',
]);
export type ScheduleType = z.infer<typeof ScheduleTypeSchema>;

export const RecurrenceTypeSchema = z.enum([
  'DAILY',
  'SPECIFIC_DAYS',
  'CYCLE',
]);
export type RecurrenceType = z.infer<typeof RecurrenceTypeSchema>;

export const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be valid HH:MM 24-hour time');

export const FallbackPolicySchema = z.enum([
  'SKIP_CHILD',
  'USE_FALLBACK_TIME',
]);
export type FallbackPolicy = z.infer<typeof FallbackPolicySchema>;

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  medicationId: z.string().uuid(),
  scheduleType: ScheduleTypeSchema,
  recurrenceType: RecurrenceTypeSchema.default('DAILY'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  timezoneId: z.string().min(1, 'Timezone ID is required'),
  fixedTimes: z.array(TimeStringSchema).default([]),
  activeWeekdays: z.array(z.number().int().min(1).max(7)).default([]), // 1=Mon, 7=Sun
  cycleDaysOn: z.number().int().positive().nullable().optional(),
  cycleDaysOff: z.number().int().positive().nullable().optional(),
  cycleAnchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  intervalHours: z.number().int().min(2).max(24).nullable().optional(),
  intervalFirstTime: TimeStringSchema.nullable().optional(),
  parentMedicationId: z.string().uuid().nullable().optional(),
  delayMinutes: z.number().int().positive().nullable().optional(),
  fallbackPolicy: FallbackPolicySchema.nullable().optional(),
  fallbackTime: TimeStringSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;
