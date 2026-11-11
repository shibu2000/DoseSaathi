import { z } from 'zod';

export const LifecycleStatusSchema = z.enum([
  'ACTIVE',
  'QUEUED_PHASE',
  'COMPLETED',
  'PAUSED',
]);
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;

export const CourseTypeSchema = z.enum([
  'ONGOING',
  'FIXED_DAYS',
  'FIXED_DOSES',
]);
export type CourseType = z.infer<typeof CourseTypeSchema>;

export const MedicationSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  name: z.string().min(1, 'Medication name is required'),
  dosageText: z.string().min(1, 'Dosage description is required'),
  doseQuantity: z.number().positive('Dose quantity must be greater than zero').default(1.0),
  doseUnit: z.string().default('tablet'),
  instructions: z.string().optional(),
  lifecycleStatus: LifecycleStatusSchema.default('ACTIVE'),
  courseType: CourseTypeSchema.default('ONGOING'),
  courseStartAt: z.string().datetime({ message: 'Must be ISO 8601 UTC string' }),
  maxDurationDays: z.number().int().positive().nullable().optional(),
  maxTotalDoses: z.number().int().positive().nullable().optional(),
  dosesTakenCount: z.number().int().nonnegative().default(0),
  trackStock: z.boolean().default(false),
  currentStock: z.number().nonnegative().default(0),
  lowStockThreshold: z.number().nonnegative().default(5),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Medication = z.infer<typeof MedicationSchema>;
