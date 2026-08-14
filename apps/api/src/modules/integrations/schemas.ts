import { z } from 'zod';

export const integrationScopes = [
  'calls:create',
  'calls:read',
  'calls:cancel',
  'calls:stop',
  'call-batches:create',
  'call-batches:read',
  'call-results:read',
  'call-profiles:read',
  'optouts:create',
  'appointments:read',
  'webhooks:manage',
  'calls:production',
] as const;

export type IntegrationScope = (typeof integrationScopes)[number];

export const createIntegrationClientSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    environment: z.enum(['sandbox', 'production']),
    allowedScopes: z.array(z.enum(integrationScopes)).min(1),
    allowedCallProfiles: z.array(z.string().regex(/^cp_[a-z0-9_]+_v\d+$/u)).max(100),
    allowedIps: z.array(z.string().ip()).max(100).default([]),
    rateLimitPerMinute: z.number().int().positive().max(10_000).default(120),
    dailyCallLimit: z.number().int().positive().max(100_000).default(100),
    concurrentCallLimit: z.number().int().positive().max(100).default(1),
    webhookEndpoint: z.string().url().max(2048).optional(),
  })
  .strict();

export const updateIntegrationClientSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['active', 'suspended']).optional(),
    allowedScopes: z.array(z.enum(integrationScopes)).min(1).optional(),
    allowedCallProfiles: z
      .array(z.string().regex(/^cp_[a-z0-9_]+_v\d+$/u))
      .max(100)
      .optional(),
    allowedIps: z.array(z.string().ip()).max(100).optional(),
    rateLimitPerMinute: z.number().int().positive().max(10_000).optional(),
    dailyCallLimit: z.number().int().positive().max(100_000).optional(),
    concurrentCallLimit: z.number().int().positive().max(100).optional(),
    webhookEndpoint: z.string().url().max(2048).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one field is required');

export const createCallProfileSchema = z
  .object({
    publicId: z.string().regex(/^cp_[a-z0-9_]+_v\d+$/u),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).default(''),
    environment: z.enum(['sandbox', 'production']),
    productVersionId: z.string().uuid(),
    aiAgentVersionId: z.string().uuid(),
    scenarioVersionId: z.string().uuid(),
    knowledgeBaseId: z.string().uuid().nullable().optional(),
    timezone: z.string().min(1).max(100).default('Asia/Tokyo'),
    callableWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    callableStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    callableEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    dailyCallLimit: z.number().int().positive().max(100_000).default(100),
    concurrentCallLimit: z.number().int().positive().max(100).default(1),
    status: z.enum(['draft', 'active']).default('draft'),
  })
  .strict();

const contextValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);
const contextSchema = z
  .record(z.string().min(1).max(64), contextValue)
  .refine((value) => Object.keys(value).length <= 50, 'context supports at most 50 fields')
  .refine(
    (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 32 * 1024,
    'context too large',
  );

export const externalCallSchema = z
  .object({
    external_call_id: z.string().min(1).max(200),
    external_customer_id: z.string().min(1).max(200),
    call_profile_id: z.string().regex(/^cp_[a-z0-9_]+_v\d+$/u),
    destination: z.object({ phone: z.string().min(6).max(30) }).strict(),
    customer: z
      .object({
        company_name: z.string().max(200).optional(),
        contact_name: z.string().max(200).optional(),
      })
      .strict()
      .default({}),
    context: contextSchema.default({}),
    execution: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('immediate') }).strict(),
      z
        .object({
          mode: z.literal('scheduled'),
          scheduled_at: z.string().datetime({ offset: true }),
        })
        .strict(),
    ]),
  })
  .strict();

export const externalCallBatchSchema = z
  .object({
    external_batch_id: z.string().min(1).max(200),
    call_profile_id: z.string().regex(/^cp_[a-z0-9_]+_v\d+$/u),
    targets: z
      .array(
        z
          .object({
            external_call_id: z.string().min(1).max(200),
            external_customer_id: z.string().min(1).max(200),
            phone: z.string().min(6).max(30),
            company_name: z.string().max(200).optional(),
            contact_name: z.string().max(200).optional(),
            context: contextSchema.default({}),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.targets.map((target) => target.external_call_id)).size === value.targets.length,
    'external_call_id must be unique within a batch',
  );
