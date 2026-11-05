/**
 * New-announcement form validation. Error messages are i18n keys.
 */
import { z } from 'zod';

import type { AnnouncementAudience } from '@/domain/types';

export const AUDIENCES: AnnouncementAudience[] = ['everyone', 'all_parents', 'all_staff', 'therapy_type'];

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, 'messages:new.errors.title').max(80, 'messages:new.errors.titleLong'),
    body: z.string().trim().min(5, 'messages:new.errors.body').max(1000, 'messages:new.errors.bodyLong'),
    audience: z.enum(['everyone', 'all_parents', 'all_staff', 'therapy_type']),
    therapyTypeId: z.string().optional(),
    urgent: z.boolean(),
  })
  .refine((v) => v.audience !== 'therapy_type' || !!v.therapyTypeId, { message: 'messages:new.errors.group', path: ['therapyTypeId'] });

export type AnnouncementFormValues = z.infer<typeof announcementSchema>;

export const EMPTY_ANNOUNCEMENT: AnnouncementFormValues = { title: '', body: '', audience: 'all_parents', therapyTypeId: undefined, urgent: false };

/** Payload for `repo.messaging.createAnnouncement` (group id only when a group is chosen). */
export function toAnnouncementInput(v: AnnouncementFormValues) {
  return {
    title: v.title.trim(),
    body: v.body.trim(),
    audience: v.audience,
    therapyTypeId: v.audience === 'therapy_type' ? v.therapyTypeId : undefined,
    urgent: v.urgent,
  };
}
