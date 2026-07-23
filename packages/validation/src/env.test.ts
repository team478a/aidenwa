import { describe, expect, it } from 'vitest';
import { apiEnvSchema, workerEnvSchema } from './env';

describe('environment validation', () => {
  it('applies safe local defaults', () => expect(apiEnvSchema.parse({}).API_PORT).toBe(3001));
  it('rejects invalid ports', () => expect(() => apiEnvSchema.parse({ API_PORT: '0' })).toThrow());
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
});
