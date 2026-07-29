export const executableImportStatuses = ['preview_ready', 'queued'] as const;
export const retryableImportStatuses = ['completed_with_errors', 'failed'] as const;
export const cancellableImportStatuses = [
  'uploaded',
  'mapping_required',
  'preview_ready',
  'queued',
] as const;

export function isImportStateAllowed(status: string, allowed: readonly string[]) {
  return allowed.includes(status);
}
