import { Prisma, type PrismaClient } from '@sales-ai/database';
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhoneNumber,
} from '@sales-ai/shared/stage2';

const BATCH_SIZE = 200;

type NormalizedRow = Record<string, string>;

export async function processCompanyImport(
  prisma: PrismaClient,
  data: { importJobId: string; organizationId: string },
) {
  const job = await prisma.importJob.findFirst({
    where: { id: data.importJobId, organizationId: data.organizationId },
  });
  if (!job || ['completed', 'cancelled'].includes(job.status)) return;

  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: 'processing', startedAt: job.startedAt ?? new Date(), errorMessage: null },
  });

  let cursor: string | undefined;
  for (;;) {
    const current = await prisma.importJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    if (!current || current.status === 'cancelled') return;

    const rows = await prisma.importRow.findMany({
      where: {
        importJobId: job.id,
        processingStatus: { in: ['pending', 'failed'] },
      },
      orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;

    for (const row of rows) {
      const status = await prisma.importJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (!status || status.status === 'cancelled') return;
      await processImportRow(prisma, job, row.id);
    }
    cursor = rows.at(-1)?.id;
  }

  const grouped = await prisma.importRow.groupBy({
    by: ['processingStatus'],
    where: { importJobId: job.id },
    _count: { _all: true },
  });
  const count = (status: string) =>
    grouped.find((item) => item.processingStatus === status)?._count._all ?? 0;
  const imported = count('success');
  const skipped = count('skipped');
  const errors = count('failed');
  await prisma.$transaction([
    prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: errors ? 'completed_with_errors' : 'completed',
        importedRows: imported,
        skippedRows: skipped,
        errorRows: errors,
        completedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: job.organizationId,
        userId: job.createdBy,
        action: 'import.completed',
        entityType: 'import_job',
        entityId: job.id,
        afterData: {
          totalRows: imported + skipped + errors,
          importedRows: imported,
          skippedRows: skipped,
          errorRows: errors,
        },
      },
    }),
  ]);
}

export async function processImportRow(
  prisma: PrismaClient,
  job: {
    id: string;
    organizationId: string;
    createdBy: string;
    duplicatePolicy: string;
  },
  rowId: string,
  hooks: { afterCompany?: () => void | Promise<void> } = {},
) {
  const claimed = await prisma.importRow.updateMany({
    where: { id: rowId, importJobId: job.id, processingStatus: { in: ['pending', 'failed'] } },
    data: {
      processingStatus: 'processing',
      attemptCount: { increment: 1 },
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (!claimed.count) return;

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.importRow.findUniqueOrThrow({ where: { id: rowId } });
      const normalized = row.normalizedData as NormalizedRow;
      if (['skip', 'review', 'error'].includes(row.action)) {
        await tx.importRow.update({
          where: { id: row.id },
          data: {
            processingStatus: row.action === 'error' ? 'failed' : 'skipped',
            lastErrorCode: row.action === 'error' ? 'validation_error' : null,
            lastErrorMessage: null,
            processedAt: new Date(),
          },
        });
        return;
      }

      const candidates = await findCandidates(tx, job.organizationId, normalized);
      const existingId = candidates[0]?.id;
      let companyId: string;
      if (existingId && (row.action === 'update' || row.action === 'fill_blank')) {
        const existing = await tx.company.findFirstOrThrow({
          where: { id: existingId, organizationId: job.organizationId, isDeleted: false },
        });
        const values = companyValues(normalized);
        const update =
          row.action === 'fill_blank'
            ? Object.fromEntries(
                Object.entries(values).filter(
                  ([key, value]) => value && !existing[key as keyof typeof existing],
                ),
              )
            : values;
        await tx.company.update({ where: { id: existing.id }, data: update });
        companyId = existing.id;
      } else if (existingId && job.duplicatePolicy !== 'create') {
        await tx.importRow.update({
          where: { id: row.id },
          data: {
            duplicateCandidates: candidates.map((item) => ({
              companyId: item.id,
              companyName: item.name,
              reasons: item.reasons,
            })),
            processingStatus: 'skipped',
            lastErrorCode: 'duplicate_detected',
            processedAt: new Date(),
          },
        });
        return;
      } else {
        if (!normalized.name) throw new ImportRowError('name_required', 'Company name is required');
        const company = await tx.company.create({
          data: {
            organizationId: job.organizationId,
            name: normalized.name,
            normalizedName: normalizeCompanyName(normalized.name),
            ...companyValues(normalized),
            sourceType: normalized.sourceType || 'csv_import',
            sourceMetadata: { importJobId: job.id, rowNumber: row.rowNumber },
          },
        });
        companyId = company.id;
      }

      await hooks.afterCompany?.();

      if (normalized.phone) {
        const phone = normalizePhoneNumber(normalized.phone);
        const existingPhone = await tx.phoneNumber.findFirst({
          where: {
            organizationId: job.organizationId,
            companyId,
            normalizedNumber: phone.normalizedNumber,
            isDeleted: false,
          },
        });
        const phoneData = {
          ...phone,
          type: phoneType(normalized.phoneType),
          isCallable: normalized.phoneType !== 'fax' && phone.isValid,
          isPrimary: true,
        };
        if (existingPhone)
          await tx.phoneNumber.update({ where: { id: existingPhone.id }, data: phoneData });
        else
          await tx.phoneNumber.create({
            data: { organizationId: job.organizationId, companyId, ...phoneData },
          });
      }

      if (normalized.contactName) {
        const email = normalizeEmail(normalized.email);
        const existingContact = await tx.companyContact.findFirst({
          where: {
            organizationId: job.organizationId,
            companyId,
            name: normalized.contactName,
            email,
            isDeleted: false,
          },
        });
        const contactData = {
          name: normalized.contactName,
          department: normalized.department || null,
          position: normalized.position || null,
          email,
          sourceType: 'csv_import',
        };
        if (existingContact)
          await tx.companyContact.update({
            where: { id: existingContact.id },
            data: contactData,
          });
        else
          await tx.companyContact.create({
            data: { organizationId: job.organizationId, companyId, ...contactData },
          });
      }

      await tx.importRow.update({
        where: { id: row.id },
        data: {
          resultCompanyId: companyId,
          processingStatus: 'success',
          lastErrorCode: null,
          lastErrorMessage: null,
          processedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: job.organizationId,
          userId: job.createdBy,
          action: 'import.row_succeeded',
          entityType: 'import_row',
          entityId: row.id,
          afterData: { rowNumber: row.rowNumber, resultCompanyId: companyId },
        },
      });
    });
  } catch (cause) {
    const code = cause instanceof ImportRowError ? cause.code : 'processing_error';
    const message =
      cause instanceof ImportRowError
        ? cause.message.slice(0, 500)
        : 'Import row processing failed';
    await prisma.importRow.updateMany({
      where: { id: rowId, processingStatus: 'processing' },
      data: {
        processingStatus: 'failed',
        lastErrorCode: code,
        lastErrorMessage: message,
        processedAt: new Date(),
      },
    });
  }
}

class ImportRowError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function findCandidates(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: NormalizedRow,
) {
  const phone = input.phone ? normalizePhoneNumber(input.phone).normalizedNumber : null;
  const domain = normalizeDomain(input.websiteUrl);
  const normalizedName = input.name ? normalizeCompanyName(input.name) : null;
  const companies = await tx.company.findMany({
    where: {
      organizationId,
      isDeleted: false,
      OR: [
        ...(input.corporateNumber ? [{ corporateNumber: input.corporateNumber }] : []),
        ...(phone
          ? [{ phoneNumbers: { some: { normalizedNumber: phone, isDeleted: false } } }]
          : []),
        ...(domain ? [{ websiteUrl: { contains: domain, mode: 'insensitive' as const } }] : []),
        ...(normalizedName ? [{ normalizedName }] : []),
      ],
    },
    include: { phoneNumbers: { where: { isDeleted: false } } },
    take: 20,
  });
  return companies
    .map((company) => {
      const reasons: string[] = [];
      if (input.corporateNumber && company.corporateNumber === input.corporateNumber)
        reasons.push('corporate_number_exact');
      if (phone && company.phoneNumbers.some((item) => item.normalizedNumber === phone))
        reasons.push('phone_exact');
      if (domain && normalizeDomain(company.websiteUrl) === domain) reasons.push('domain_exact');
      if (normalizedName && company.normalizedName === normalizedName)
        reasons.push('normalized_name');
      return { ...company, reasons };
    })
    .filter((company) => company.reasons.length);
}

function companyValues(input: NormalizedRow) {
  return {
    ...(input.corporateNumber ? { corporateNumber: input.corporateNumber } : {}),
    ...(input.nameKana ? { nameKana: input.nameKana } : {}),
    ...(input.postalCode ? { postalCode: input.postalCode } : {}),
    ...(input.prefecture ? { prefecture: input.prefecture } : {}),
    ...(input.city ? { city: input.city } : {}),
    ...(input.address ? { address: input.address } : {}),
    ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
    ...(input.inquiryUrl ? { inquiryUrl: input.inquiryUrl } : {}),
    ...(input.industryName ? { industryName: input.industryName } : {}),
  };
}

function phoneType(value?: string) {
  const allowed = ['representative', 'department', 'store', 'direct', 'mobile', 'fax', 'unknown'];
  return (allowed.includes(value ?? '') ? value : 'unknown') as
    'representative' | 'department' | 'store' | 'direct' | 'mobile' | 'fax' | 'unknown';
}
