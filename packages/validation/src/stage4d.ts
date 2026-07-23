import { z } from 'zod';

const controlledCode = z.string().regex(/^[a-z0-9_]{1,50}$/);
const controlledCodes = z
  .array(controlledCode)
  .max(12)
  .transform((items) => [...new Set(items)]);
const safeSummary = z.string().trim().max(200).optional().nullable();

const salesHandoffBaseSchema = z.object({
  interestLevel: z.enum(['hot', 'warm', 'cool', 'none', 'unknown']),
  interestCodes: controlledCodes,
  painPointCodes: controlledCodes,
  objectionCodes: controlledCodes,
  decisionRole: z.enum(['decision_maker', 'influencer', 'user', 'gatekeeper', 'unknown']),
  timelineCode: z.enum(['immediate', 'within_1_month', 'within_3_months', 'later', 'unknown']),
  budgetSignal: z.enum(['available', 'under_review', 'constrained', 'not_discussed', 'unknown']),
  callbackRequested: z.boolean(),
  callbackWindowCode: controlledCode.optional().nullable(),
  humanQuestionCodes: controlledCodes,
  recommendedNextAction: z.enum([
    'urgent_callback',
    'normal_callback',
    'send_information',
    'schedule_meeting',
    'nurture',
    'close_no_interest',
    'block_opt_out',
    'manual_review',
  ]),
  confidenceBand: z.enum(['high', 'medium', 'low']),
  customerNeedSummary: safeSummary,
  objectionSummary: safeSummary,
  nextConversationHint: safeSummary,
  unansweredQuestionSummary: safeSummary,
});
const validateCallbackWindow = (
  value: { callbackRequested: boolean; callbackWindowCode?: string | null | undefined },
  context: z.RefinementCtx,
) => {
  if (!value.callbackRequested && value.callbackWindowCode)
    context.addIssue({
      code: 'custom',
      path: ['callbackWindowCode'],
      message: 'callback未希望です',
    });
};
export const salesHandoffSchema = salesHandoffBaseSchema.superRefine(validateCallbackWindow);

export const handoffFinalizeSchema = salesHandoffBaseSchema
  .extend({
    realtimeSessionId: z.string().uuid(),
    companyId: z.string().uuid(),
    contactId: z.string().uuid().optional().nullable(),
    source: z.enum(['ai_realtime', 'fake', 'manual_review']).default('fake'),
    optOut: z.boolean().default(false),
    evidenceEventFingerprints: z
      .array(z.string().regex(/^[a-f0-9]{16,64}$/))
      .max(20)
      .default([]),
  })
  .superRefine(validateCallbackWindow);

export const handoffFeedbackSchema = z.object({
  verdict: z.enum(['correct', 'partially_correct', 'incorrect', 'insufficient_information']),
  fieldCode: controlledCode.optional(),
  correctedCode: controlledCode.optional(),
  reasonCode: controlledCode,
  note: safeSummary,
});

export const handoffSettingsSchema = z.object({
  allowedCodes: z.record(z.string(), controlledCodes).default({}),
  scoreRules: z.record(z.string(), z.number().int().min(-50).max(50)).default({}),
});
