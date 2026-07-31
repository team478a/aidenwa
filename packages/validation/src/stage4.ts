import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
export const approvalInputSchema = z.object({
  organizationId: z.string().uuid().optional(),
  targetRegions: z.array(z.string().min(2).max(32)).min(1),
  productIds: z.array(z.string().uuid()).min(1),
  purpose: z.string().min(3).max(1000),
  aiDisclosure: z.string().min(3).max(1000),
  recordingEnabled: z.boolean(),
  recordingConsentMethod: z.string().max(1000),
  transcriptionEnabled: z.boolean(),
  personalDataRetentionDays: z.number().int().min(1).max(3650),
  callableWeekdays: z.array(z.number().int().min(0).max(6)).min(1),
  callableStartTime: time,
  callableEndTime: time,
  dailyCallLimit: z.number().int().positive(),
  hourlyCallLimit: z.number().int().positive(),
  concurrentCallLimit: z.number().int().positive(),
  maxAttemptsPerCompany: z.number().int().positive(),
  minRetryIntervalMinutes: z.number().int().positive(),
  optOutOwner: z.string().min(2).max(200),
  emergencyStopOwner: z.string().min(2).max(200),
  privacyOwner: z.string().min(2).max(200),
  plannedProvider: z.string().min(2).max(100),
  dataResidency: z.string().min(2).max(200),
  crossBorderConfirmed: z.boolean(),
  humanTransferMethod: z.string().min(2).max(1000),
  limitedTestCallLimit: z.number().int().positive(),
  expiresAt: z.coerce.date(),
  approvalBasis: z.string().min(3).max(4000),
  notes: z.string().max(4000).default(''),
});

export type ApprovalInput = z.infer<typeof approvalInputSchema>;
export const reasonSchema = z.object({ reason: z.string().min(3).max(2000) });
export const policySchema = z.object({
  organizationId: z.string().uuid().optional(),
  timezone: z.string().min(1).max(100).default('Asia/Tokyo'),
  dailyCallLimit: z.number().int().positive(),
  hourlyCallLimit: z.number().int().positive(),
  concurrentCallLimit: z.number().int().positive(),
  maxCallDurationSeconds: z.number().int().positive(),
  dailyDurationLimitSeconds: z.number().int().positive(),
  monthlyBudgetMinor: z.number().int().nonnegative(),
  dailyBudgetMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  limitedTestCallLimit: z.number().int().positive(),
  mockCostPerCallMinor: z.number().int().nonnegative(),
});

export type ProductionPolicyInput = z.infer<typeof policySchema>;
export const stopSchema = z.object({
  organizationId: z.string().uuid().optional(),
  scope: z.enum(['system', 'organization', 'campaign', 'product', 'provider']),
  scopeId: z.string().min(1).max(200).nullable().optional(),
  reason: z.string().min(3).max(2000),
});

export type EmergencyStopInput = z.infer<typeof stopSchema>;
export const allowlistSchema = z.object({
  organizationId: z.string().uuid().optional(),
  phoneNumber: z.string().min(8).max(32),
  region: z.string().min(2).max(32),
  ownerName: z.string().min(2).max(200),
  purpose: z.string().min(3).max(1000),
  consentConfirmed: z.literal(true),
  expiresAt: z.coerce.date(),
  notes: z.string().max(2000).default(''),
});

export type TestAllowlistInput = z.infer<typeof allowlistSchema>;
export const providerConfigSchema = z.object({
  organizationId: z.string().uuid().optional(),
  provider: z.string().min(2).max(100),
  allowed: z.boolean(),
  secretReferenceKey: z.string().min(3).max(200).nullable().optional(),
});
export const gateInputSchema = z.object({
  organizationId: z.string().uuid().optional(),
  campaignId: z.string().uuid(),
  companyId: z.string().uuid(),
  phoneNumberId: z.string().uuid(),
  provider: z.string().min(2).max(100),
  region: z.string().min(2).max(32),
});
export const mockWebhookSchema = z.object({
  organizationId: z.string().uuid(),
  eventId: z.string().min(3).max(200),
  eventType: z.string().min(2).max(100),
  timestamp: z.string().datetime(),
  callAttemptId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  sequenceNumber: z.number().int().nonnegative().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
