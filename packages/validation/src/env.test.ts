import { describe, expect, it } from 'vitest';
import { apiEnvSchema, workerEnvSchema } from './env';

describe('environment validation', () => {
  it('applies safe local defaults', () => expect(apiEnvSchema.parse({}).API_PORT).toBe(3001));
  it('rejects invalid ports', () => expect(() => apiEnvSchema.parse({ API_PORT: '0' })).toThrow());
  it('keeps development and test local defaults available', () => {
    expect(apiEnvSchema.parse({ NODE_ENV: 'development' }).DATABASE_URL).toContain('localhost');
    expect(workerEnvSchema.parse({ NODE_ENV: 'test' }).REDIS_URL).toContain('localhost');
  });
  it('treats the string false as disabled for every external integration flag', () => {
    const values = {
      PRODUCTION_CALLS_ENABLED: 'false',
      REALTIME_AI_ENABLED: 'false',
      TWILIO_MEDIA_STREAMS_ENABLED: 'false',
      ZOOM_PHONE_INTEGRATION_ENABLED: 'false',
      ZOOM_PHONE_OUTBOUND_ENABLED: 'false',
      AI_HANDOFF_ENABLED: 'false',
      CALENDAR_INTEGRATION_ENABLED: 'false',
      AI_APPOINTMENT_BOOKING_ENABLED: 'false',
    };
    const api = apiEnvSchema.parse(values);
    const worker = workerEnvSchema.parse(values);
    expect([
      api.PRODUCTION_CALLS_ENABLED,
      api.REALTIME_AI_ENABLED,
      api.TWILIO_MEDIA_STREAMS_ENABLED,
      api.ZOOM_PHONE_INTEGRATION_ENABLED,
      api.ZOOM_PHONE_OUTBOUND_ENABLED,
      api.AI_HANDOFF_ENABLED,
      api.CALENDAR_INTEGRATION_ENABLED,
      api.AI_APPOINTMENT_BOOKING_ENABLED,
      worker.PRODUCTION_CALLS_ENABLED,
      worker.REALTIME_AI_ENABLED,
      worker.TWILIO_MEDIA_STREAMS_ENABLED,
      worker.ZOOM_PHONE_INTEGRATION_ENABLED,
      worker.ZOOM_PHONE_OUTBOUND_ENABLED,
    ]).toEqual(Array.from({ length: 13 }, () => false));
  });

  it('accepts production settings with external integrations disabled', () => {
    const values = productionValues();
    expect(apiEnvSchema.parse(values).NODE_ENV).toBe('production');
    expect(workerEnvSchema.parse(values).DATABASE_URL).toBe(values.DATABASE_URL);
  });

  it.each([
    ['DATABASE_URL', undefined],
    ['DATABASE_URL', 'postgresql://user:password@localhost:5432/app'],
    ['REDIS_URL', 'redis://127.0.0.1:6379'],
    ['WEB_ORIGIN', 'https://web.example.local'],
    ['SOURCE_NUMBER_FINGERPRINT_KEY', 'stage4b-local-fingerprint-key'],
    ['MOCK_WEBHOOK_SECRET', 'replace-with-secret-value'],
    ['APPOINTMENT_SLOT_TOKEN_SECRET', 'too-short-secret'],
    ['RELEASE_COMMIT', 'uncommitted'],
  ])('rejects unsafe production %s', (key, value) => {
    const values: Record<string, string | undefined> = { ...productionValues(), [key]: value };
    expect(() => apiEnvSchema.parse(values)).toThrow();
    expect(() => workerEnvSchema.parse(values)).toThrow();
  });

  it('rejects a production API loopback bind address', () => {
    expect(() => apiEnvSchema.parse({ ...productionValues(), API_HOST: '127.0.0.1' })).toThrow(
      /API_HOST/,
    );
  });

  it('requires Twilio values only when Twilio is enabled', () => {
    const values = { ...productionValues(), VOICE_PROVIDER: 'twilio' };
    expect(() => apiEnvSchema.parse(values)).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it('requires OpenAI Realtime values only when realtime AI is enabled', () => {
    const values = { ...productionValues(), REALTIME_AI_ENABLED: 'true' };
    expect(() => apiEnvSchema.parse(values)).toThrow(/OPENAI_API_KEY/);
  });

  it('requires Zoom values only when Zoom is enabled', () => {
    const values = { ...productionValues(), ZOOM_PHONE_INTEGRATION_ENABLED: 'true' };
    expect(() => workerEnvSchema.parse(values)).toThrow(/ZOOM_ACCOUNT_ID/);
  });

  it('does not include rejected secret values in validation errors', () => {
    const secret = 'replace-with-never-print-this-secret';
    const result = apiEnvSchema.safeParse({
      ...productionValues(),
      MOCK_WEBHOOK_SECRET: secret,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain(secret);
      expect(result.error.issues.some((issue) => issue.path[0] === 'MOCK_WEBHOOK_SECRET')).toBe(
        true,
      );
    }
  });
});

function productionValues() {
  return {
    NODE_ENV: 'production',
    API_HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://service:password@database.internal:5432/sales_ai',
    REDIS_URL: 'rediss://cache.internal:6379',
    WEB_ORIGIN: 'https://app.aidenwa.jp',
    RELEASE_COMMIT: '0123456789abcdef',
    SOURCE_NUMBER_FINGERPRINT_KEY: 'production-fingerprint-key-2026',
    MOCK_WEBHOOK_SECRET: 'production-mock-webhook-secret',
    APPOINTMENT_SLOT_TOKEN_SECRET: 'production-appointment-token-secret-2026',
  } as const;
}
