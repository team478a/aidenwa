import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import rawBody from 'fastify-raw-body';
import Redis from 'ioredis';
import { Prisma, PrismaClient, UserRole, UserStatus } from '@sales-ai/database';
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '@sales-ai/shared/security';
import { apiEnvSchema } from '@sales-ai/validation/env';
import {
  changePasswordSchema,
  createTeamSchema,
  createUserSchema,
  idParamsSchema,
  loginSchema,
  updateOrganizationSchema,
  updateTeamSchema,
  updateUserSchema,
} from '@sales-ai/validation';
import { requestMetadata, writeAudit } from './audit.js';
import type { AppOptions, AuthContext } from './types.js';
import { registerStage2Routes } from './stage2-routes.js';
import { registerStage3Routes } from './stage3-routes.js';
import { registerStage4Routes } from './stage4-routes.js';
import { registerStage4BRoutes } from './stage4b-routes.js';
import { registerStage4B2Routes } from './stage4b2-routes.js';
import { registerStage4B2MediaRoutes } from './stage4b2-media.js';
import { registerStage4DRoutes } from './stage4d-routes.js';
import { registerStage4ERoutes } from './stage4e-routes.js';
import { sendPublicError, toPublicError } from './core/errors/http-error.js';

const SESSION_COOKIE = 'sales_ai_session';
const CSRF_COOKIE = 'sales_ai_csrf';
const publicUser = {
  id: true,
  organizationId: true,
  teamId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function error(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ error: { code, message } });
}

export function buildApp(environment: NodeJS.ProcessEnv = process.env, options: AppOptions = {}) {
  const env = apiEnvSchema.parse(environment);
  const prisma =
    options.prisma ?? new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const ownsPrisma = !options.prisma;
  const app = Fastify({
    logger:
      environment.NODE_ENV !== 'test'
        ? {
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'body.password',
              'body.currentPassword',
              'body.newPassword',
            ],
          }
        : false,
  });
  void app.register(cookie);
  void app.register(formbody);
  void app.register(websocket);
  void app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true });

  app.addHook('onClose', async () => {
    if (ownsPrisma) await prisma.$disconnect();
  });
  app.setErrorHandler((cause, _request, reply) => {
    const mapped = toPublicError(cause);
    if (mapped.logCause) app.log.error(cause);
    return sendPublicError(reply, cause);
  });

  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthContext | undefined> {
    const rawToken = request.cookies[SESSION_COOKIE];
    if (!rawToken) {
      error(reply, 401, 'UNAUTHENTICATED', 'ログインが必要です');
      return;
    }
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true, organization: true },
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.active ||
      session.organization.status !== 'active'
    ) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      clearCookies(reply, environment.NODE_ENV === 'production');
      error(reply, 401, 'UNAUTHENTICATED', 'セッションが無効です');
      return;
    }
    const context = {
      sessionId: session.id,
      organizationId: session.organizationId,
      userId: session.userId,
      role: session.user.role,
      csrfTokenHash: session.csrfTokenHash,
    };
    request.auth = context;
    return context;
  }

  async function authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ) {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    if (!roles.includes(auth.role)) {
      error(reply, 403, 'FORBIDDEN', 'この操作を行う権限がありません');
      return;
    }
    return auth;
  }

  function verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean {
    const token = request.headers['x-csrf-token'];
    const origin = request.headers.origin;
    if (
      typeof token !== 'string' ||
      hashToken(token) !== auth.csrfTokenHash ||
      (origin && origin !== env.WEB_ORIGIN)
    ) {
      error(reply, 403, 'CSRF_INVALID', 'リクエストを確認できません');
      return false;
    }
    return true;
  }

  app.get('/health', () => ({ service: 'api', status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/health/worker', async (_request, reply) => {
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      const health = await redis.get(env.WORKER_HEALTH_KEY);
      if (!health) return reply.code(503).send({ service: 'worker', status: 'unavailable' });
      return reply.send(JSON.parse(health));
    } finally {
      redis.disconnect();
    }
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const organizationSlug = input.organizationSlug ?? env.DEFAULT_ORGANIZATION_SLUG;
    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
    });
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    const rateKey = `login:${hashToken(`${organizationSlug}:${input.email}:${request.ip}`)}`;
    try {
      await redis.connect();
      const attempts = await redis.incr(rateKey);
      if (attempts === 1) await redis.expire(rateKey, 900);
      if (attempts > 5)
        return error(reply, 429, 'RATE_LIMITED', 'しばらく待ってから再試行してください');
      const user = organization
        ? await prisma.user.findUnique({
            where: {
              organizationId_email: { organizationId: organization.id, email: input.email },
            },
          })
        : null;
      const valid = user
        ? await verifyPassword(input.password, user.passwordHash)
        : await verifyPassword(
            input.password,
            'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          );
      if (
        !organization ||
        organization.status !== 'active' ||
        !user ||
        !valid ||
        user.status !== UserStatus.active
      ) {
        await writeAudit(prisma, {
          organizationId: organization?.id,
          userId: user?.id,
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: user?.id,
          afterData: {
            email: input.email,
            reason: user?.status === UserStatus.suspended ? 'suspended' : 'invalid_credentials',
          },
          ...requestMetadata(request),
        });
        return error(
          reply,
          401,
          'INVALID_CREDENTIALS',
          'メールアドレスまたはパスワードが正しくありません',
        );
      }
      await redis.del(rateKey);
      const sessionToken = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000);
      await prisma.$transaction(async (tx) => {
        await tx.session.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            tokenHash: hashToken(sessionToken),
            csrfTokenHash: hashToken(csrfToken),
            expiresAt,
          },
        });
        await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await tx.auditLog.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: 'auth.login_succeeded',
            entityType: 'user',
            entityId: user.id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          },
        });
      });
      setCookies(reply, sessionToken, csrfToken, expiresAt, environment.NODE_ENV === 'production');
      const safeUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: publicUser,
      });
      return reply.send({ user: safeUser, csrfToken });
    } finally {
      redis.disconnect();
    }
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth || !verifyCsrf(request, reply, auth)) return;
    await prisma.session.delete({ where: { id: auth.sessionId } });
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: auth.userId,
      ...requestMetadata(request),
    });
    clearCookies(reply, environment.NODE_ENV === 'production');
    return reply.code(204).send();
  });
  app.get('/api/v1/auth/me', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    const user = await prisma.user.findFirst({
      where: { id: auth.userId, organizationId: auth.organizationId },
      select: publicUser,
    });
    return { user };
  });
  app.get('/api/v1/auth/session', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    return {
      active: true,
      expiresAt: (await prisma.session.findUniqueOrThrow({ where: { id: auth.sessionId } }))
        .expiresAt,
    };
  });
  app.post('/api/v1/auth/change-password', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth || !verifyCsrf(request, reply, auth)) return;
    const input = changePasswordSchema.parse(request.body);
    const user = await prisma.user.findFirstOrThrow({
      where: { id: auth.userId, organizationId: auth.organizationId },
    });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
      return error(reply, 400, 'INVALID_PASSWORD', '現在のパスワードが正しくありません');
    const newHash = await hashPassword(input.newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({
        data: {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: 'auth.password_changed',
          entityType: 'user',
          entityId: user.id,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      }),
    ]);
    clearCookies(reply, environment.NODE_ENV === 'production');
    return reply.code(204).send();
  });

  app.get('/api/v1/users', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    return {
      users: await prisma.user.findMany({
        where: { organizationId: auth.organizationId },
        select: { ...publicUser, team: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    };
  });
  app.get('/api/v1/users/:id', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const user = await prisma.user.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: publicUser,
    });
    return user ? { user } : error(reply, 404, 'NOT_FOUND', 'ユーザーが見つかりません');
  });
  app.post('/api/v1/users', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin]);
    if (!auth || !verifyCsrf(request, reply, auth)) return;
    const input = createUserSchema.parse(request.body);
    if (input.role === UserRole.system_admin)
      return error(reply, 403, 'FORBIDDEN', 'system_adminは組織管理APIから作成できません');
    if (
      input.teamId &&
      !(await prisma.team.findFirst({
        where: { id: input.teamId, organizationId: auth.organizationId },
      }))
    )
      return error(reply, 400, 'INVALID_TEAM', 'チームが正しくありません');
    const createData: Prisma.UserUncheckedCreateInput = {
      organizationId: auth.organizationId,
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      status: UserStatus.active,
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
    };
    const user = await prisma.user.create({ data: createData, select: publicUser });
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      afterData: user,
      ...requestMetadata(request),
    });
    return reply.code(201).send({ user });
  });
  app.patch('/api/v1/users/:id', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth || !verifyCsrf(request, reply, auth)) return;
    const { id } = idParamsSchema.parse(request.params);
    const input = updateUserSchema.parse(request.body);
    const before = await prisma.user.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: publicUser,
    });
    if (!before) return error(reply, 404, 'NOT_FOUND', 'ユーザーが見つかりません');
    if (input.role === UserRole.system_admin || before.role === UserRole.system_admin)
      return error(reply, 403, 'FORBIDDEN', 'system_admin権限は組織管理APIから変更できません');
    if (
      auth.role === UserRole.manager &&
      (input.name || input.role || before.role !== UserRole.sales)
    )
      return error(reply, 403, 'FORBIDDEN', 'managerは営業担当者のチーム割当のみ変更できます');
    if (
      input.teamId &&
      !(await prisma.team.findFirst({
        where: { id: input.teamId, organizationId: auth.organizationId },
      }))
    )
      return error(reply, 400, 'INVALID_TEAM', 'チームが正しくありません');
    const updateData: Prisma.UserUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
    };
    const user = await prisma.user.update({ where: { id }, data: updateData, select: publicUser });
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      beforeData: before,
      afterData: user,
      ...requestMetadata(request),
    });
    return { user };
  });
  for (const [path, status, action] of [
    ['suspend', UserStatus.suspended, 'user.suspended'],
    ['activate', UserStatus.active, 'user.activated'],
  ] as const) {
    app.post(`/api/v1/users/:id/${path}`, async (request, reply) => {
      const auth = await authorize(request, reply, [UserRole.admin]);
      if (!auth || !verifyCsrf(request, reply, auth)) return;
      const { id } = idParamsSchema.parse(request.params);
      const before = await prisma.user.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: publicUser,
      });
      if (!before) return error(reply, 404, 'NOT_FOUND', 'ユーザーが見つかりません');
      const user = await prisma.user.update({
        where: { id },
        data: { status },
        select: publicUser,
      });
      if (status === UserStatus.suspended)
        await prisma.session.deleteMany({ where: { userId: id } });
      await writeAudit(prisma, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action,
        entityType: 'user',
        entityId: id,
        beforeData: before,
        afterData: user,
        ...requestMetadata(request),
      });
      return { user };
    });
  }

  app.get('/api/v1/teams', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    return {
      teams: await prisma.team.findMany({
        where: { organizationId: auth.organizationId },
        include: {
          manager: { select: { id: true, name: true } },
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
      }),
    };
  });
  app.post('/api/v1/teams', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin]);
    if (!auth || !verifyCsrf(request, reply, auth)) return;
    const input = createTeamSchema.parse(request.body);
    if (
      input.managerUserId &&
      !(await prisma.user.findFirst({
        where: {
          id: input.managerUserId,
          organizationId: auth.organizationId,
          role: { in: [UserRole.admin, UserRole.manager] },
        },
      }))
    )
      return error(reply, 400, 'INVALID_MANAGER', '責任者が正しくありません');
    const data: Prisma.TeamUncheckedCreateInput = {
      organizationId: auth.organizationId,
      name: input.name,
      ...(input.managerUserId !== undefined ? { managerUserId: input.managerUserId } : {}),
    };
    const team = await prisma.team.create({ data });
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'team.created',
      entityType: 'team',
      entityId: team.id,
      afterData: team,
      ...requestMetadata(request),
    });
    return reply.code(201).send({ team });
  });
  app.patch('/api/v1/teams/:id', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin]);
    if (!auth || !verifyCsrf(request, reply, auth)) return;
    const { id } = idParamsSchema.parse(request.params);
    const input = updateTeamSchema.parse(request.body);
    const before = await prisma.team.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!before) return error(reply, 404, 'NOT_FOUND', 'チームが見つかりません');
    if (
      input.managerUserId &&
      !(await prisma.user.findFirst({
        where: {
          id: input.managerUserId,
          organizationId: auth.organizationId,
          role: { in: [UserRole.admin, UserRole.manager] },
        },
      }))
    )
      return error(reply, 400, 'INVALID_MANAGER', '責任者が正しくありません');
    const data: Prisma.TeamUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.managerUserId !== undefined ? { managerUserId: input.managerUserId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    const team = await prisma.team.update({ where: { id }, data });
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'team.updated',
      entityType: 'team',
      entityId: id,
      beforeData: before,
      afterData: team,
      ...requestMetadata(request),
    });
    return { team };
  });

  app.get('/api/v1/organization', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: auth.organizationId },
    });
    return { organization };
  });
  app.patch('/api/v1/organization', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin]);
    if (!auth || !verifyCsrf(request, reply, auth)) return;
    const input = updateOrganizationSchema.parse(request.body);
    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: auth.organizationId },
    });
    const data: Prisma.OrganizationUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.settings !== undefined
        ? { settings: input.settings as Prisma.InputJsonValue }
        : {}),
    };
    const organization = await prisma.organization.update({
      where: { id: auth.organizationId },
      data,
    });
    await writeAudit(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: auth.organizationId,
      beforeData: before,
      afterData: organization,
      ...requestMetadata(request),
    });
    return { organization };
  });
  app.get('/api/v1/audit-logs', async (request, reply) => {
    const auth = await authorize(request, reply, [UserRole.admin]);
    if (!auth) return;
    return {
      auditLogs: await prisma.auditLog.findMany({
        where: { organizationId: auth.organizationId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
    };
  });
  registerStage2Routes(app, { prisma, env, authenticate, authorize, verifyCsrf, error });
  registerStage3Routes(app, {
    prisma,
    redisUrl: env.REDIS_URL,
    nodeEnv: env.NODE_ENV,
    authenticate,
    authorize,
    verifyCsrf,
    error,
  });
  registerStage4Routes(app, {
    prisma,
    webhookSecret: env.MOCK_WEBHOOK_SECRET,
    redisUrl: env.REDIS_URL,
    authenticate,
    authorize,
    verifyCsrf,
    error,
  });
  registerStage4BRoutes(app, { prisma, env, authorize, verifyCsrf, error });
  registerStage4B2Routes(app, { prisma, env, authorize, verifyCsrf, error });
  registerStage4B2MediaRoutes(app, { prisma, env });
  registerStage4DRoutes(app, { prisma, env, authorize, verifyCsrf, error });
  registerStage4ERoutes(app, { prisma, env, authorize, verifyCsrf, error });
  return app;
}

function setCookies(
  reply: FastifyReply,
  session: string,
  csrf: string,
  expires: Date,
  secure: boolean,
) {
  reply.setCookie(SESSION_COOKIE, session, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    expires,
  });
  reply.setCookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    expires,
  });
}
function clearCookies(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'strict', path: '/' });
  reply.clearCookie(CSRF_COOKIE, { httpOnly: false, secure, sameSite: 'strict', path: '/' });
}
