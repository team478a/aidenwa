import { z } from 'zod';
const code = z.string().regex(/^[a-z0-9_]{1,50}$/);
const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'IANA timezoneが必要です');
export const appointmentSlotPayloadSchema = z
  .object({
    organizationId: z.string().uuid(),
    userId: z.string().uuid(),
    policyId: z.string().uuid(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    timezone,
    expires: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Date(value.start) >= new Date(value.end))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'end must be after start',
      });
  });
const hhmm = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const appointmentPolicySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    timezone,
    meetingTypeCode: code,
    durationMinutes: z.number().int().min(15).max(240),
    bufferBeforeMinutes: z.number().int().min(0).max(120).default(0),
    bufferAfterMinutes: z.number().int().min(0).max(120).default(0),
    minimumNoticeMinutes: z.number().int().min(0).max(10080).default(60),
    maximumAdvanceDays: z.number().int().min(1).max(365).default(30),
    holdTtlMinutes: z.number().int().min(1).max(30).default(10),
    cancellationDeadlineMinutes: z.number().int().min(0).max(43200).default(60),
    assignmentMode: z
      .enum(['existing_owner', 'campaign_owner', 'round_robin', 'manual'])
      .default('manual'),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
  })
  .refine(
    (value) =>
      !value.validFrom ||
      !value.validUntil ||
      new Date(value.validFrom) <= new Date(value.validUntil),
    { path: ['validUntil'], message: 'validUntil must not precede validFrom' },
  );
export const availabilityRuleSchema = z
  .object({
    userId: z.string().uuid(),
    timezone,
    weekday: z.number().int().min(0).max(6),
    startLocalTime: hhmm,
    endLocalTime: hhmm,
    effectiveFrom: z.string().date().optional(),
    effectiveUntil: z.string().date().optional(),
  })
  .superRefine((value, context) => {
    if (value.startLocalTime >= value.endLocalTime)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endLocalTime'],
        message: '日跨ぎは別ruleに分割してください',
      });
    if (value.effectiveFrom && value.effectiveUntil && value.effectiveFrom > value.effectiveUntil)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveUntil'],
        message: 'effectiveUntil must not precede effectiveFrom',
      });
  });
export const availabilityExceptionSchema = z.object({
  userId: z.string().uuid(),
  date: z.string().date(),
  type: z.enum(['available', 'unavailable']),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  reasonCode: code,
});
export const appointmentSlotsSchema = z.object({
  policyVersionId: z.string().uuid(),
  assigneeUserId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  confirmedTimezone: timezone,
  preferredTimeBand: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
});
export const appointmentHoldSchema = z.object({
  slotToken: z.string().min(20).max(4096),
  idempotencyKey: z.string().min(8).max(100),
  campaignId: z.string().uuid(),
  companyId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  realtimeSessionId: z.string().uuid().optional(),
  handoffCardId: z.string().uuid().optional(),
  followupTaskId: z.string().uuid().optional(),
});
export const appointmentConfirmSchema = z.object({
  version: z.number().int().min(0),
  customerConfirmed: z.literal(true),
  confirmationCode: code,
});
export const appointmentTransitionSchema = z.object({
  version: z.number().int().min(0),
  reasonCode: code,
});
export const appointmentRescheduleSchema = z.object({
  version: z.number().int().min(0),
  slotToken: z.string().min(20).max(4096),
  reasonCode: code,
});
