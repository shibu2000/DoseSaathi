import { z } from 'zod';
import { MedicationSchema } from './medications';
import { ScheduleSchema } from './schedules';

export const CommandStatusSchema = z.enum([
  'PENDING_DEVICE',
  'RECEIVED',
  'APPLIED',
  'REJECTED',
  'SUPERSEDED',
]);
export type CommandStatus = z.infer<typeof CommandStatusSchema>;

export const PlanSnapshotSchema = z.object({
  medications: z.array(MedicationSchema),
  schedules: z.array(ScheduleSchema),
});
export type PlanSnapshot = z.infer<typeof PlanSnapshotSchema>;

export const SubmitPlanCommandSchema = z.object({
  commandId: z.string().uuid(),
  baseVersion: z.number().int().nonnegative(),
  planSnapshot: PlanSnapshotSchema,
});
export type SubmitPlanCommand = z.infer<typeof SubmitPlanCommandSchema>;

export const DeviceAckCommandSchema = z.object({
  commandId: z.string().uuid(),
  status: z.enum(['APPLIED', 'REJECTED']),
  appliedVersion: z.number().int().positive().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type DeviceAckCommand = z.infer<typeof DeviceAckCommandSchema>;
