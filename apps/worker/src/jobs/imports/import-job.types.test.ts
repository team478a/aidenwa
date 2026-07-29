import { describe, expect, it } from 'vitest';
import { parseImportJobData } from './import-job.types';

describe('Import Worker job boundary', () => {
  it('accepts the stable Outbox payload shape', () => {
    expect(
      parseImportJobData({
        importJobId: 'import-id',
        organizationId: 'organization-id',
        ignoredFutureField: true,
      }),
    ).toEqual({ importJobId: 'import-id', organizationId: 'organization-id' });
  });

  it('rejects malformed queue payloads before the Import engine', () => {
    expect(() => parseImportJobData({ importJobId: 'missing-organization' })).toThrow(
      'INVALID_IMPORT_JOB_DATA',
    );
    expect(() => parseImportJobData(null)).toThrow('INVALID_IMPORT_JOB_DATA');
  });
});
