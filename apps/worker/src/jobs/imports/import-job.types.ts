export type ImportJobData = { importJobId: string; organizationId: string };

export function parseImportJobData(value: unknown): ImportJobData {
  if (
    !value ||
    typeof value !== 'object' ||
    !('importJobId' in value) ||
    typeof value.importJobId !== 'string' ||
    !('organizationId' in value) ||
    typeof value.organizationId !== 'string'
  )
    throw new Error('INVALID_IMPORT_JOB_DATA');
  return { importJobId: value.importJobId, organizationId: value.organizationId };
}
