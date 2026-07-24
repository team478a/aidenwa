import { z } from 'zod';

export const outboxEventTypes = [
  'company-import-mapping',
  'company-import',
  'mock-call',
  'twilio-call',
  'twilio-emergency-stop',
] as const;
export type OutboxEventType = (typeof outboxEventTypes)[number];
export const outboxEventTypeSchema = z.enum(outboxEventTypes);

const companyImportPayloadSchema = z.object({
  importJobId: z.string().uuid(),
  organizationId: z.string().uuid(),
});
const mockCallPayloadSchema = z.object({
  callJobId: z.string().uuid(),
  organizationId: z.string().uuid(),
});
const twilioCallPayloadSchema = z.object({ executionId: z.string().uuid() });
const twilioEmergencyStopPayloadSchema = z
  .object({
    organizationId: z.string().uuid().nullable().optional(),
    scope: z.enum(['system', 'organization', 'campaign', 'product', 'provider']),
    scopeId: z.string().uuid().nullable().optional(),
    authorizationId: z.string().uuid().optional(),
    emergencyStopId: z.string().uuid().optional(),
  })
  .refine((value) => value.authorizationId || value.emergencyStopId, {
    message: 'authorizationId or emergencyStopId is required',
  });

export type CompanyImportOutboxPayload = z.infer<typeof companyImportPayloadSchema>;
export type MockCallOutboxPayload = z.infer<typeof mockCallPayloadSchema>;
export type TwilioCallOutboxPayload = z.infer<typeof twilioCallPayloadSchema>;
export type TwilioEmergencyStopOutboxPayload = z.infer<typeof twilioEmergencyStopPayloadSchema>;
export type OutboxPayload =
  | CompanyImportOutboxPayload
  | MockCallOutboxPayload
  | TwilioCallOutboxPayload
  | TwilioEmergencyStopOutboxPayload;

export function parseOutboxPayload(eventType: OutboxEventType, payload: unknown): OutboxPayload {
  switch (eventType) {
    case 'company-import-mapping':
    case 'company-import':
      return companyImportPayloadSchema.parse(payload);
    case 'mock-call':
      return mockCallPayloadSchema.parse(payload);
    case 'twilio-call':
      return twilioCallPayloadSchema.parse(payload);
    case 'twilio-emergency-stop':
      return twilioEmergencyStopPayloadSchema.parse(payload);
  }
}
