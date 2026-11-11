// Production API (v2) request/response schemas. Additive: legacy exports remain untouched.
import { z } from 'zod';
import { CommandStatusSchema } from './plan-commands';
import { PlanSnapshotV2Schema, DevicePlanReportSchema, PlanMedicationSchema } from './plan-v2';

const isoDate = z.string().datetime();

// ---- permissions -----------------------------------------------------------
export const PermissionKeySchema = z.enum(['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS', 'RECEIVE_ALERTS']);
export type PermissionKey = z.infer<typeof PermissionKeySchema>;

export const PermissionSetSchema = z
  .array(PermissionKeySchema)
  .min(1, 'At least one permission is required')
  .max(4)
  .refine((p) => new Set(p).size === p.length, 'Duplicate permissions')
  .refine((p) => !p.includes('EDIT_SCHEDULE') || p.includes('VIEW_SCHEDULE'), 'EDIT_SCHEDULE requires VIEW_SCHEDULE');

export const RelationshipStatusV2Schema = z.enum(['ACTIVE', 'REVOKED_BY_PATIENT', 'DISCONNECTED_BY_CAREGIVER']);

// ---- caregiver auth --------------------------------------------------------
export const RegisterCaregiverRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
  displayName: z.string().trim().min(1).max(80),
});
export type RegisterCaregiverRequest = z.infer<typeof RegisterCaregiverRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const CaregiverProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
});
export const AuthResponseSchema = z.object({
  caregiver: CaregiverProfileSchema,
  accessToken: z.string(),
  accessTokenExpiresAt: isoDate,
  refreshToken: z.string(),
  refreshTokenExpiresAt: isoDate,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ---- device identity -------------------------------------------------------
export const RegisterDeviceRequestSchema = z.object({
  platform: z.enum(['android', 'ios']),
  appVersion: z.string().min(1).max(32),
  pushToken: z.string().min(1).max(4096).nullable().optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequestSchema>;

export const PatchDeviceRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    pushToken: z.string().min(1).max(4096).nullable(),
    appVersion: z.string().min(1).max(32),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const RegisterDeviceResponseSchema = z.object({
  deviceId: z.string(),
  deviceSecret: z.string().optional(),
  registeredAt: isoDate,
  updated: z.boolean().optional(),
});
export type RegisterDeviceResponse = z.infer<typeof RegisterDeviceResponseSchema>;

// ---- pairing ---------------------------------------------------------------
export const PairingCodeSchema = z.string().regex(/^\d{6}$/, 'Pairing code must be 6 digits');
export const PairingSecretSchema = z.string().min(20).max(100);

export const PairingCredentialSchema = z.union([
  z.object({ code: PairingCodeSchema }),
  z.object({ sessionId: z.string().uuid(), secret: PairingSecretSchema }),
]);

export const ValidatePairingRequestSchema = PairingCredentialSchema;
export const CreatePairingRequestSchema = z.intersection(
  PairingCredentialSchema,
  z.object({ requestedPermissions: PermissionSetSchema }),
);
export type CreatePairingRequest = z.infer<typeof CreatePairingRequestSchema>;

export const ApprovePairingV2Schema = z.object({
  approvedPermissions: PermissionSetSchema,
  relationshipLabel: z.string().trim().min(1).max(60),
});
export type ApprovePairingV2 = z.infer<typeof ApprovePairingV2Schema>;

export const PairingSessionCreatedSchema = z.object({
  sessionId: z.string().uuid(),
  pairingCode: z.string().length(6),
  qrPayload: z.string().startsWith('medchain://pair'),
  expiresAt: isoDate,
  expiresInSeconds: z.number().int().positive(),
});
export type PairingSessionCreated = z.infer<typeof PairingSessionCreatedSchema>;

// ---- relationships ---------------------------------------------------------
export const RelationshipSummarySchema = z.object({
  relationshipId: z.string(),
  patientDisplayName: z.string(),
  relationshipLabel: z.string(),
  permissions: z.array(PermissionKeySchema),
  status: RelationshipStatusV2Schema,
  confirmedAt: isoDate,
  revokedAt: isoDate.nullable(),
  version: z.number().int(),
  deviceLastSeenAt: isoDate.nullable(),
  lastSyncedAt: isoDate.nullable(),
  latestPlanVersion: z.number().int(),
  lastAppliedVersion: z.number().int(),
});
export type RelationshipSummary = z.infer<typeof RelationshipSummarySchema>;

export const PatientRelationshipSchema = z.object({
  relationshipId: z.string(),
  caregiverDisplayName: z.string(),
  caregiverEmail: z.string(),
  relationshipLabel: z.string(),
  permissions: z.array(PermissionKeySchema),
  status: RelationshipStatusV2Schema,
  confirmedAt: isoDate,
  revokedAt: isoDate.nullable(),
  version: z.number().int(),
});
export type PatientRelationship = z.infer<typeof PatientRelationshipSchema>;

export const RestrictPermissionsRequestSchema = z.object({ permissions: PermissionSetSchema });

// ---- plan / commands -------------------------------------------------------
export const MAX_PLAN_SNAPSHOT_BYTES = 16 * 1024;

export const SubmitPlanCommandV2Schema = z.object({
  commandId: z.string().uuid().optional(),
  baseVersion: z.number().int().nonnegative(),
  planSnapshot: PlanSnapshotV2Schema,
});
export type SubmitPlanCommandV2 = z.infer<typeof SubmitPlanCommandV2Schema>;

export const UploadDevicePlanRequestSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  report: DevicePlanReportSchema,
});

export const MedicationCreateRequestSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  medication: PlanMedicationSchema,
});
export const MedicationPatchRequestSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  medication: PlanMedicationSchema.omit({ id: true }).partial(),
});

export const SyncStateSchema = z.enum([
  'WAITING_FOR_DEVICE',
  'RECEIVED_BY_DEVICE',
  'APPLIED',
  'REJECTED',
  'SUPERSEDED',
]);
export const PlanCommandStateSchema = z.object({
  commandId: z.string(),
  status: CommandStatusSchema,
  syncState: SyncStateSchema,
  planVersion: z.number().int(),
  baseVersion: z.number().int(),
  createdAt: isoDate,
  receivedAt: isoDate.nullable(),
  appliedAt: isoDate.nullable(),
  appliedVersion: z.number().int().nullable(),
  reasonCode: z.string().nullable(),
});
export type PlanCommandState = z.infer<typeof PlanCommandStateSchema>;

const AckItemSchema = z.object({
  commandId: z.string().min(1).max(64),
  status: z.enum(['RECEIVED', 'APPLIED', 'REJECTED']),
  appliedVersion: z.number().int().positive().optional(),
  reasonCode: z.string().max(64).optional(),
  errorCode: z.string().max(64).optional(),
});
export const DeviceAcksRequestSchema = z.union([
  z.object({ acks: z.array(AckItemSchema).min(1).max(50), cursor: z.string().max(32).optional() }),
  AckItemSchema.transform((a) => ({ acks: [a], cursor: undefined as string | undefined })),
]);
export type DeviceAcksRequest = z.infer<typeof DeviceAcksRequestSchema>;

// ---- dose events -----------------------------------------------------------
export const DoseEventKindSchema = z.enum([
  'DOSE_TAKEN',
  'DOSE_SKIPPED',
  'DOSE_SNOOZED',
  'DOSE_NOT_CONFIRMED',
  'COURSE_TRANSITION_COMPLETED',
  'COURSE_TRANSITION_UNDONE',
]);
export type DoseEventKind = z.infer<typeof DoseEventKindSchema>;

const LEGACY_EVENT_TYPES: Record<string, DoseEventKind> = {
  TAKEN: 'DOSE_TAKEN',
  SKIPPED: 'DOSE_SKIPPED',
  SNOOZED: 'DOSE_SNOOZED',
  UNCONFIRMED: 'DOSE_NOT_CONFIRMED',
};

export const DoseEventUploadSchema = z
  .object({
    eventId: z.string().uuid(),
    occurrenceId: z.string().min(1).max(128),
    medicationId: z.string().min(1).max(128),
    eventType: z.preprocess((v) => (typeof v === 'string' ? (LEGACY_EVENT_TYPES[v] ?? v) : v), DoseEventKindSchema),
    scheduledAt: isoDate.optional(),
    actionTimestamp: isoDate,
    timezoneId: z.string().min(1).max(64),
    medicationName: z.string().max(120).optional(),
    dosageText: z.string().max(120).optional(),
  })
  .superRefine((e, ctx) => {
    if (!e.scheduledAt && !e.eventType.startsWith('COURSE_TRANSITION_')) {
      ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'scheduledAt is required' });
    }
  });
export type DoseEventUpload = z.infer<typeof DoseEventUploadSchema>;

export const UploadDoseEventsRequestSchema = z.object({
  events: z.array(z.unknown()).min(1).max(100),
});

export const ActivityItemV2Schema = z.object({
  eventId: z.string(),
  relationshipId: z.string(),
  patientDisplayName: z.string(),
  medicationId: z.string(),
  medicationName: z.string().nullable(),
  dosageText: z.string().nullable(),
  occurrenceId: z.string(),
  eventType: DoseEventKindSchema,
  statusLabel: z.string(),
  scheduledAt: isoDate,
  actionTimestamp: isoDate,
  timezoneId: z.string(),
  receivedAt: isoDate,
});
export type ActivityItemV2 = z.infer<typeof ActivityItemV2Schema>;
export const ActivityPageSchema = z.object({
  items: z.array(ActivityItemV2Schema),
  nextCursor: z.string().nullable(),
});
export type ActivityPage = z.infer<typeof ActivityPageSchema>;
