import { describe, expect, it } from 'vitest';
import { UserRole } from '@sales-ai/database';

import { policyAuditProjection, resolvePolicyOrganization } from './production-policy.policy.js';

describe('production call policy', () => {
  it('keeps organization selection restricted to system administrators', () => {
    expect(
      resolvePolicyOrganization(
        { role: UserRole.system_admin, organizationId: 'system' },
        'requested',
      ),
    ).toBe('requested');
    expect(
      resolvePolicyOrganization({ role: UserRole.manager, organizationId: 'own' }, 'requested'),
    ).toBe('own');
  });

  it('projects only bounded limit fields into audit data', () => {
    expect(
      policyAuditProjection({
        dailyCallLimit: 10,
        hourlyCallLimit: 4,
        concurrentCallLimit: 2,
      }),
    ).toEqual({ limits: { daily: 10, hourly: 4, concurrent: 2 } });
  });
});
