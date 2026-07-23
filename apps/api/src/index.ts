import { buildApp } from './app.js';
import { apiEnvSchema } from '@sales-ai/validation/env';

const env = apiEnvSchema.parse(process.env);
const app = buildApp(process.env);
await app.listen({ host: env.API_HOST, port: env.API_PORT });
