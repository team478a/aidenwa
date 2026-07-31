import { createHmac } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, type PrismaClient } from '@sales-ai/database';
import { verifyZoomWebhook } from '@sales-ai/human-calling-provider';
import { fakeZoomCallSchema, type ApiEnv } from '@sales-ai/validation';
import type { AuthContext } from '../../../types.js';
import { runFakeZoomMatch } from '../workflow/followup.service.js';

type Dependencies = {
  prisma: PrismaClient;
  env: ApiEnv;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

export function registerZoomPhoneRoutes(app: FastifyInstance, deps: Dependencies) {
  const { prisma, env } = deps;

  app.post('/api/v1/fake-zoom-phone/call', async (request, reply) => {
    if (env.NODE_ENV === 'production') return reply.code(404).send();
    const auth = await deps.authorize(request, reply, [UserRole.system_admin]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const parsed = fakeZoomCallSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    return runFakeZoomMatch(prisma, env, { organizationId: auth.organizationId, ...parsed.data });
  });

  app.post('/api/v1/zoom-phone/webhook', { config: { rawBody: true } }, async (request, reply) => {
    if (!env.ZOOM_PHONE_INTEGRATION_ENABLED || !env.ZOOM_WEBHOOK_SECRET_TOKEN)
      return reply.code(404).send();
    const timestamp = request.headers['x-zm-request-timestamp'];
    const signature = request.headers['x-zm-signature'];
    const raw = request.rawBody;
    if (typeof timestamp !== 'string' || typeof signature !== 'string' || !Buffer.isBuffer(raw))
      return reply.code(403).send();
    const verified = verifyZoomWebhook({
      timestamp,
      signature,
      rawBody: raw,
      secret: env.ZOOM_WEBHOOK_SECRET_TOKEN,
    });
    if (!verified.valid) return reply.code(403).send();
    const body = request.body as { event?: unknown; payload?: { plainToken?: unknown } };
    if (body.event === 'endpoint.url_validation' && typeof body.payload?.plainToken === 'string')
      return {
        plainToken: body.payload.plainToken,
        encryptedToken: createHmac('sha256', env.ZOOM_WEBHOOK_SECRET_TOKEN)
          .update(body.payload.plainToken)
          .digest('hex'),
      };
    await prisma.zoomPhoneEvent.upsert({
      where: { eventFingerprint: verified.eventFingerprint },
      create: {
        eventFingerprint: verified.eventFingerprint,
        occurredAt: new Date(Number(timestamp) * 1000),
        sanitizedMetadata: { eventType: typeof body.event === 'string' ? body.event : 'unknown' },
      },
      update: {},
    });
    return reply.code(202).send({ accepted: true });
  });
}
