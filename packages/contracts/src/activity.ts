import { z } from 'zod';
import { DoseEventTypeSchema } from './dose-events';

export const ActivityItemSchema = z.object({
  eventId: z.string().uuid(),
  relationshipId: z.string().uuid(),
  patientDisplayName: z.string(),
  medicationName: z.string(),
  dosageText: z.string(),
  eventType: DoseEventTypeSchema,
  scheduledAt: z.string().datetime(),
  actionTimestamp: z.string().datetime(),
  timezoneId: z.string(),
  receivedAt: z.string().datetime(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const ActivityFeedResponseSchema = z.object({
  items: z.array(ActivityItemSchema),
  nextCursor: z.string().nullable().optional(),
});
export type ActivityFeedResponse = z.infer<typeof ActivityFeedResponseSchema>;
