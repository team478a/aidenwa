import { describe, expect, it } from 'vitest';
import { UserRole } from '@sales-ai/database';

import { readinessReadRoles, resolveReadinessOrganization } from './readiness.policy.js';

describe('production readiness policy', () => {
  it('allows only system administrators to select another organization', () => {
    expect(readinessReadRoles).toEqual(['system_admin', 'admin', 'manager']);
    expect(
      resolveReadinessOrganization(
        { role: UserRole.system_admin, organizationId: 'system-org' },
        'requested-org',
      ),
    ).toBe('requested-org');
    expect(
      resolveReadinessOrganization(
        { role: UserRole.admin, organizationId: 'own-org' },
        'requested-org',
      ),
    ).toBe('own-org');
  });
});
