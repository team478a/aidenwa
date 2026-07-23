import { z } from 'zod';

const short = z.string().trim().min(1).max(200);
const strings = z.array(z.string().max(500)).max(100).default([]);
export const resourceInputSchema = z.object({
  name: short,
  code: z.string().trim().min(1).max(50).optional(),
  category: z.string().max(100).optional(),
  purpose: z.string().max(2000).optional(),
  description: z.string().max(5000).optional(),
});
export const productVersionSchema = z.object({
  summary: z.string().max(5000).default(''),
  targetCustomer: z.string().max(5000).default(''),
  customerProblems: strings,
  valuePropositions: strings,
  differentiators: strings,
  pricingSummary: z.string().max(3000).default(''),
  qualificationConditions: strings,
  disqualificationConditions: strings,
  requiredDisclosures: strings,
  prohibitedClaims: strings,
  appointmentGoal: z.string().max(2000).default(''),
});
export const agentVersionSchema = z.object({
  displayName: short,
  roleDescription: z.string().max(5000).default(''),
  language: z.string().max(10).default('ja'),
  speakingStyle: z.string().max(100).default('professional'),
  politenessLevel: z.number().int().min(1).max(5).default(3),
  speakingSpeed: z.number().min(0.5).max(2).default(1),
  silenceTimeoutSeconds: z.number().int().min(3).max(60).default(10),
  maxTurns: z.number().int().min(1).max(100).default(20),
  maxCallDurationSeconds: z.number().int().min(30).max(1800).default(600),
  identityDisclosure: z.string().max(2000).default(''),
  aiDisclosure: z.string().max(2000).default(''),
  recordingDisclosure: z.literal('').default(''),
  prohibitedTopics: strings,
  fallbackMessage: z.string().max(2000).default(''),
  closingMessage: z.string().max(2000).default(''),
});
export const graphSchema = z.object({
  nodes: z
    .array(
      z.object({
        nodeKey: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        nodeType: z.enum([
          'start',
          'speak',
          'listen',
          'branch',
          'faq_lookup',
          'qualify',
          'schedule_request',
          'transfer_request',
          'opt_out',
          'end',
        ]),
        title: short,
        instruction: z.string().max(5000).default(''),
        messageTemplate: z.string().max(5000).default(''),
      }),
    )
    .min(1)
    .max(200),
  edges: z
    .array(
      z.object({
        fromNodeKey: z.string(),
        toNodeKey: z.string(),
        conditionType: z.string().max(50),
        conditionValue: z.string().max(200).default(''),
        priority: z.number().int().min(0).max(10000).default(100),
        label: z.string().max(200).default(''),
      }),
    )
    .max(500),
});
export const simulateSchema = z.object({ intents: z.array(z.string().max(100)).max(50) });
export const documentSchema = z.object({
  title: short,
  sourceType: z.enum(['manual', 'faq', 'text']).default('manual'),
});
export const entrySchema = z.object({
  question: z.string().max(3000).default(''),
  answer: z.string().min(1).max(10000),
  keywords: z.array(z.string().max(100)).max(50).default([]),
  category: z.string().max(100).default(''),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});
export const searchSchema = z.object({ query: z.string().trim().min(1).max(500) });
export const campaignSchema = z.object({
  name: short,
  description: z.string().max(3000).default(''),
  productVersionId: z.string().uuid(),
  aiAgentVersionId: z.string().uuid(),
  scenarioVersionId: z.string().uuid(),
  knowledgeBaseId: z.string().uuid().nullable().optional(),
  salesListId: z.string().uuid(),
  timezone: z.string().default('Asia/Tokyo'),
  callableWeekdays: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  callableStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('09:00'),
  callableEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('18:00'),
  maxAttemptsPerTarget: z.number().int().min(1).max(10).default(3),
  maxConcurrentCalls: z.number().int().min(1).max(10).default(1),
  dailyCallLimit: z.number().int().min(1).max(1000).default(100),
});
export const fixtureSchema = z.object({
  fixture: z
    .enum([
      'answered',
      'no_answer',
      'busy',
      'qualified',
      'opt_out',
      'invalid_number',
      'fax_detected',
    ])
    .default('qualified'),
});
