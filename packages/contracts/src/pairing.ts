import { z } from 'zod';
import { PermissionFlagSchema } from './relationships';

export const PairingSessionStatusSchema = z.enum([
  'PENDING',
  'CONSUMED',
  'EXPIRED',
  'REVOKED',
]);
export type PairingSessionStatus = z.infer<typeof PairingSessionStatusSchema>;

export const CreatePairingSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  pairingCode: z.string().length(6),
  qrPayload: z.string().url().or(z.string().startsWith('medchain://')),
  expiresAt: z.string().datetime(),
});
export type CreatePairingSessionResponse = z.infer<typeof CreatePairingSessionResponseSchema>;

export const SubmitPairingRequestSchema = z.object({
  code: z.string().length(6, 'Pairing code must be 6 digits'),
  requestedPermissions: z.array(PermissionFlagSchema).min(1, 'Must request at least one permission'),
});
export type SubmitPairingRequest = z.infer<typeof SubmitPairingRequestSchema>;

export const ApprovePairingRequestSchema = z.object({
  approvedPermissions: z.array(PermissionFlagSchema).min(1, 'Must approve at least one permission'),
  relationshipLabel: z.string().min(1, 'Relationship label is required'),
});
export type ApprovePairingRequest = z.infer<typeof ApprovePairingRequestSchema>;

export const PairingRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
]);
export type PairingRequestStatus = z.infer<typeof PairingRequestStatusSchema>;
