import { describe, expect, it } from 'vitest';

import {
  callJobMutationRoles,
  canUseMockCallFixture,
  cancellableCallJobStatuses,
} from './call-job.policy.js';

describe('call job policy', () => {
  it('limits mutations and disables fixtures in production', () => {
    expect(callJobMutationRoles).toEqual(['admin', 'manager']);
    expect(cancellableCallJobStatuses).toEqual(['queued', 'reserved', 'dispatching']);
    expect(canUseMockCallFixture('test')).toBe(true);
    expect(canUseMockCallFixture('production')).toBe(false);
  });
});
