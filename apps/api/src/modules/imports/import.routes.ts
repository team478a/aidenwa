import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { UserRole } from '@sales-ai/database';
import { parseImportUpload } from './import.controller.js';
import { findImportJob, findImportRows } from './import.repository.js';
import { idParamsSchema, mappingSchema } from './import.schemas.js';
import {
  cancelImport,
  configureImportMapping,
  queueImportExecution,
  retryFailedImportRows,
  type ImportServiceResult,
} from './import.service.js';
import type { ImportReadMode, ImportRouteDeps } from './import.types.js';

export function registerImportRoutes(app: FastifyInstance, deps: ImportRouteDeps) {
  app.post('/api/v1/imports/companies/upload', async (request, reply) => {
    const auth = await deps.mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const upload = await parseImportUpload(request, deps.env);
    if ('error' in upload)
      return deps.error(reply, upload.error.status, upload.error.code, upload.error.message);
    const job = await deps.prisma.importJob.create({
      data: {
        organizationId: auth.organizationId,
        originalFileName: upload.fileName,
        storageKey: `db://${randomUUID()}`,
        encoding: upload.encoding,
        status: 'mapping_required',
        totalRows: upload.records.length,
        createdBy: auth.userId,
        expiresAt: new Date(Date.now() + deps.env.IMPORT_RETENTION_HOURS * 3_600_000),
        rows: {
          create: upload.records.map((record, index) => ({
            rowNumber: index + 2,
            rawData: record,
            normalizedData: {},
            validationErrors: [],
          })),
        },
      },
    });
    await deps.audit(request, auth, 'import.uploaded', 'import_job', job.id, {
      originalFileName: job.originalFileName,
      totalRows: job.totalRows,
      encoding: upload.encoding,
    });
    return reply.code(201).send({ importJob: job, headers: upload.headers });
  });

  app.post('/api/v1/imports/companies/:id/mapping', async (request, reply) => {
    const auth = await deps.mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const input = mappingSchema.parse(request.body);
    const result = await configureImportMapping(deps.prisma, {
      id,
      organizationId: auth.organizationId,
      mapping: input.mapping,
      duplicatePolicy: input.duplicatePolicy,
    });
    if (!result.ok) return sendServiceError(reply, deps, result);
    return reply.code(202).send({ importJob: result.value });
  });

  for (const mode of ['preview', 'status', 'errors'] as const)
    app.get(`/api/v1/imports/companies/:id/${mode}`, async (request, reply) => {
      const auth = await deps.authenticate(request, reply);
      if (!auth) return;
      if (auth.role === UserRole.sales)
        return deps.error(reply, 403, 'FORBIDDEN', 'インポート権限がありません');
      const { id } = idParamsSchema.parse(request.params);
      const job = await findImportJob(deps.prisma, auth.organizationId, id);
      if (!job) return deps.error(reply, 404, 'NOT_FOUND', 'インポートが見つかりません');
      return readResponse(deps, id, mode, job);
    });

  app.post('/api/v1/imports/companies/:id/execute', async (request, reply) => {
    const auth = await deps.mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const result = await queueImportExecution(deps.prisma, auth.organizationId, id);
    if (!result.ok) return sendServiceError(reply, deps, result);
    await deps.audit(request, auth, 'import.executed', 'import_job', id, {
      status: 'queued',
      totalRows: result.value.totalRows,
    });
    return reply.code(202).send({ importJobId: id, status: 'queued' });
  });

  app.post('/api/v1/imports/companies/:id/retry-failed', async (request, reply) => {
    const auth = await deps.mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const result = await retryFailedImportRows(deps.prisma, auth.organizationId, id);
    if (!result.ok) return sendServiceError(reply, deps, result);
    await deps.audit(request, auth, 'import.failed_rows_retried', 'import_job', id, {
      status: 'queued',
      failedRows: result.value.failedRows,
    });
    return reply
      .code(202)
      .send({ importJobId: id, status: 'queued', failedRows: result.value.failedRows });
  });

  app.post('/api/v1/imports/companies/:id/cancel', async (request, reply) => {
    const auth = await deps.mutationAuth(request, reply, [UserRole.admin, UserRole.manager]);
    if (!auth) return;
    const { id } = idParamsSchema.parse(request.params);
    const result = await cancelImport(deps.prisma, auth.organizationId, id);
    if (!result.ok) return sendServiceError(reply, deps, result);
    await deps.audit(request, auth, 'import.cancelled', 'import_job', id, result.value);
    return result.value;
  });
}

async function readResponse(
  deps: ImportRouteDeps,
  id: string,
  mode: ImportReadMode,
  importJob: NonNullable<Awaited<ReturnType<typeof findImportJob>>>,
) {
  return mode === 'status'
    ? { importJob }
    : { importJob, rows: await findImportRows(deps.prisma, id, mode) };
}

function sendServiceError(
  reply: FastifyReply,
  deps: ImportRouteDeps,
  result: Extract<ImportServiceResult<unknown>, { ok: false }>,
) {
  return deps.error(reply, result.status, result.code, result.message);
}
