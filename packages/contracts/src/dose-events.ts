import { z } from 'zod';

export const DoseEventTypeSchema = z.enum([
  'TAKEN',
  'SKIPPED',
  'SNOOZED',
  'UNCONFIRMED',
]);
export type DoseEventType = z.infer<typeof DoseEventTypeSchema>;

export const DoseEventSchema = z.object({
  eventId: z.string().uuid(),
  relationshipId: z.string().uuid().optional(),
  medicationId: z.string().uuid(),
  occurrenceId: z.string().min(1),
  eventType: DoseEventTypeSchema,
  scheduledAt: z.string().datetime(),
  actionTimestamp: z.string().datetime(),
  timezoneId: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type DoseEvent = z.infer<typeof DoseEventSchema>;

export const BatchDoseEventsSchema = z.object({
  events: z.array(DoseEventSchema).min(1),
});
export type BatchDoseEvents = z.infer<typeof BatchDoseEventsSchema>;
