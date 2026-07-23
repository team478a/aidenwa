import { z } from 'zod';

const envBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

const runtimeSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
const redisSchema = runtimeSchema.extend({
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  WORKER_HEALTH_KEY: z.string().min(1).default('sales-ai-os:worker:health'),
});
const twilioSchema = {
  VOICE_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
  PRODUCTION_CALLS_ENABLED: envBoolean.default(false),
  PRODUCTION_PROVIDER_ALLOWLIST: z.string().default('mock'),
  RELEASE_COMMIT: z.string().default('uncommitted'),
  SOURCE_NUMBER_FINGERPRINT_KEY: z.string().min(16).default('stage4b-local-fingerprint-key'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_API_KEY_SID: z.string().optional(),
  TWILIO_API_KEY_SECRET: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  TWILIO_REGION: z.string().optional(),
  TWILIO_EDGE: z.string().optional(),
  TWILIO_STATUS_CALLBACK_BASE_URL: z.string().url().optional(),
  TWILIO_TWIML_BASE_URL: z.string().url().optional(),
  TWILIO_MAX_CALL_SECONDS: z.coerce.number().int().min(1).max(120).default(120),
  TWILIO_ESTIMATED_COST_MINOR_PER_MINUTE: z.coerce.number().int().min(1).default(100),
  TWILIO_VOICE_NAME: z.string().default('Polly.Mizuki'),
};
const realtimeSchema = {
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().min(1).default('gpt-realtime-mini'),
  OPENAI_REALTIME_VOICE: z.string().optional(),
  REALTIME_AI_ENABLED: envBoolean.default(false),
  TWILIO_MEDIA_STREAMS_ENABLED: envBoolean.default(false),
  REALTIME_SESSION_MAX_SECONDS: z.coerce.number().int().min(1).max(120).default(120),
  REALTIME_MAX_CONCURRENT_SESSIONS: z.coerce.number().int().min(1).max(10).default(2),
  REALTIME_EVENT_MAX_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
  REALTIME_TRANSCRIPT_RETENTION_DAYS: z.literal(0).default(0),
  ZOOM_PHONE_INTEGRATION_ENABLED: envBoolean.default(false),
  ZOOM_PHONE_OUTBOUND_ENABLED: envBoolean.default(false),
  ZOOM_ACCOUNT_ID: z.string().optional(),
  ZOOM_CLIENT_ID: z.string().optional(),
  ZOOM_CLIENT_SECRET: z.string().optional(),
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string().optional(),
  ZOOM_PHONE_API_BASE_URL: z.string().url().default('https://api.zoom.us/v2'),
  ZOOM_PHONE_SYNC_LOOKBACK_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
  ZOOM_PHONE_FINGERPRINT_SECRET: z.string().min(32).optional(),
  REALTIME_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(10_000),
  REALTIME_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  REALTIME_MAX_PENDING_AUDIO_BYTES: z.coerce
    .number()
    .int()
    .min(8192)
    .max(8_388_608)
    .default(1_048_576),
  REALTIME_MAX_MESSAGES_PER_SECOND: z.coerce.number().int().min(1).max(1000).default(100),
  REALTIME_STALE_SESSION_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  REALTIME_SESSION_TOKEN_SECRET: z.string().min(32).optional(),
  TWILIO_MEDIA_STREAM_BASE_URL: z.string().url().optional(),
};

export const apiEnvSchema = redisSchema.extend({
  ...twilioSchema,
  ...realtimeSchema,
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public'),
  DEFAULT_ORGANIZATION_SLUG: z.string().min(1).default('internal'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  CSV_MAX_BYTES: z.coerce.number().int().min(1024).max(50_000_000).default(10_000_000),
  CSV_MAX_ROWS: z.coerce.number().int().min(1).max(100_000).default(10_000),
  IMPORT_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  IMPORT_STORAGE_DIR: z.string().min(1).default('.data/imports'),
  BULK_OPERATION_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
  STAGE3_JSON_MAX_BYTES: z.coerce.number().int().min(1024).max(5_000_000).default(200_000),
  SCENARIO_MAX_NODES: z.coerce.number().int().min(2).max(1000).default(200),
  KNOWLEDGE_ENTRY_MAX_CHARS: z.coerce.number().int().min(100).max(100_000).default(10_000),
  MOCK_RUN_BATCH_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  MOCK_WEBHOOK_SECRET: z.string().min(16).default('stage4a-local-mock-secret'),
  AI_HANDOFF_ENABLED: envBoolean.default(false),
  HANDOFF_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  CALENDAR_INTEGRATION_ENABLED: envBoolean.default(false),
  AI_APPOINTMENT_BOOKING_ENABLED: envBoolean.default(false),
  APPOINTMENT_SLOT_TOKEN_SECRET: z.string().min(32).default('stage4e-local-slot-token-secret-32'),
});
export const workerEnvSchema = redisSchema.extend({
  ...twilioSchema,
  ...realtimeSchema,
  MOCK_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  STUCK_RESERVATION_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  CALL_EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
});
export const databaseEnvSchema = runtimeSchema.extend({ DATABASE_URL: z.string().url() });
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
