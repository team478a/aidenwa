import { z } from 'zod';

export const productionTestAuthorizationSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    releaseCommit: z.string().regex(/^[a-f0-9]{7,64}$/u),
    writtenApprovalCommit: z.string().regex(/^[a-f0-9]{7,64}$/u),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    maxCalls: z.literal(5),
    maxDestinations: z.literal(5),
    maxCallSeconds: z.literal(120),
    approvedAllowlistIds: z.array(z.string().uuid()).min(1).max(5),
    sourceNumberApprovalId: z.string().uuid().optional(),
    budgetLimitMinor: z.number().int().positive(),
    currency: z.string().length(3),
    recordingEnabled: z.literal(false),
    transcriptionEnabled: z.literal(false),
    mediaStreamsEnabled: z.literal(false),
    humanTransferEnabled: z.literal(false),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: 'endsAt must be after startsAt' })
  .refine((v) => v.releaseCommit === v.writtenApprovalCommit, {
    message: 'release commit mismatch',
  });
export const realCallRequestSchema = z.object({
  authorizationId: z.string().uuid(),
  campaignId: z.string().uuid(),
  companyId: z.string().uuid(),
  phoneNumberId: z.string().uuid(),
  allowlistId: z.string().uuid(),
});
export const providerUnknownResolutionSchema = z.object({
  resolution: z.enum(['confirmed_not_created', 'incident']),
  reason: z.string().trim().min(10).max(1000),
});
export const sourceNumberApprovalSchema = z.object({
  sourceNumberE164: z.string().regex(/^\+[1-9]\d{7,14}$/u),
  ownershipEvidenceRef: z.string().trim().min(5).max(500),
  expiresAt: z.coerce.date().refine((date) => date > new Date(), 'expiry must be in the future'),
});
export const incidentResolutionSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});
export const twilioWebhookParamsSchema = z
  .object({
    CallSid: z.string().regex(/^CA[a-fA-F0-9]{32}$/u),
    CallStatus: z.string().optional(),
    SequenceNumber: z.coerce.number().int().nonnegative().optional(),
    Digits: z.string().max(1).optional(),
    CallDuration: z.coerce.number().int().nonnegative().optional(),
    Price: z.string().optional(),
    PriceUnit: z.string().length(3).optional(),
  })
  .passthrough();
