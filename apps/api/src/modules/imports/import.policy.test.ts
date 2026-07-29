import { describe, expect, it } from 'vitest';
import {
  cancellableImportStatuses,
  executableImportStatuses,
  isImportStateAllowed,
  retryableImportStatuses,
} from './import.policy';

describe('Import state policy', () => {
  it('keeps execution, retry, and cancellation states separate', () => {
    expect(isImportStateAllowed('preview_ready', executableImportStatuses)).toBe(true);
    expect(isImportStateAllowed('completed_with_errors', retryableImportStatuses)).toBe(true);
    expect(isImportStateAllowed('mapping_required', cancellableImportStatuses)).toBe(true);
    expect(isImportStateAllowed('processing', cancellableImportStatuses)).toBe(false);
    expect(isImportStateAllowed('completed', executableImportStatuses)).toBe(false);
  });
});
