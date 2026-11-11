import { z } from 'zod';

export const PermissionFlagSchema = z.enum([
  'VIEW_SCHEDULE',
  'MANAGE_SCHEDULE',
  'VIEW_DOSE_LOGS',
  'RECEIVE_NOTIFICATIONS',
]);
export type PermissionFlag = z.infer<typeof PermissionFlagSchema>;

export const RelationshipStatusSchema = z.enum([
  'ACTIVE',
  'REVOKED_BY_PATIENT',
  'DISCONNECTED_BY_CAREGIVER',
]);
export type RelationshipStatus = z.infer<typeof RelationshipStatusSchema>;

export const RelationshipSchema = z.object({
  id: z.string().uuid(),
  patientDeviceId: z.string().uuid(),
  caregiverUserId: z.string().uuid(),
  relationshipLabel: z.string().min(1),
  status: RelationshipStatusSchema,
  permissions: z.array(PermissionFlagSchema),
  confirmedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable().optional(),
  version: z.number().int().positive().default(1),
});
export type Relationship = z.infer<typeof RelationshipSchema>;
