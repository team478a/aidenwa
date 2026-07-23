import { z } from 'zod';

export const fakeRealtimeSimulationSchema = z.object({
  campaignId: z.string().uuid(),
  companyId: z.string().uuid(),
  phoneNumberId: z.string().uuid(),
  executionId: z.string().uuid().optional(),
  fixture: z.enum([
    'qualified',
    'barge_in',
    'faq',
    'human_requested',
    'opt_out',
    'silence',
    'connection_failed',
    'disconnect',
    'provider_unknown',
  ]),
});
export const followupAssignSchema = z.object({
  assigneeUserId: z.string().uuid(),
  version: z.number().int().nonnegative(),
});
export const followupCompleteSchema = z.object({
  version: z.number().int().nonnegative(),
  outcomeCode: z.enum([
    'appointment_booked',
    'proposal_requested',
    'information_requested',
    'callback_again',
    'not_interested',
    'wrong_person',
    'no_answer',
    'busy',
    'invalid_number',
    'opt_out',
    'other_controlled',
  ]),
  nextActionCode: z
    .enum(['none', 'call_again', 'send_information', 'prepare_proposal', 'appointment'])
    .default('none'),
  nextActionAt: z.coerce.date().optional(),
  note: z.string().trim().max(1000).optional(),
});
export const followupVersionSchema = z.object({ version: z.number().int().nonnegative() });
export const followupSnoozeSchema = followupVersionSchema.extend({
  until: z.coerce.date(),
  reasonCode: z.enum([
    'customer_request',
    'outside_hours',
    'awaiting_information',
    'other_controlled',
  ]),
});
export const followupAttemptSchema = followupVersionSchema.extend({
  result: z.enum(['connected', 'no_answer', 'busy', 'not_connected', 'provider_failed', 'unknown']),
  idempotencyKey: z.string().min(8).max(100),
});
export const fakeZoomCallSchema = z.object({
  taskId: z.string().uuid(),
  fixture: z.enum([
    'connected',
    'no_answer',
    'busy',
    'rejected',
    'provider_failed',
    'ambiguous',
    'unknown',
  ]),
});
export const followupAssignmentRuleSchema = z.object({
  mode: z.enum(['none', 'round_robin', 'team', 'campaign_fixed']),
  teamId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  fixedAssigneeId: z.string().uuid().nullable().optional(),
});
export const realtimeTerminateSchema = z.object({ reason: z.string().trim().min(5).max(500) });
