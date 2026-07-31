import { describe, expect, it } from 'vitest';
import { UserRole } from '@sales-ai/database';

import { canActivateSystemStop, resolveStopOrganization } from './emergency-stop.policy.js';

describe('emergency stop policy', () => {
  it('reserves system-wide activation for system administrators', () => {
    expect(canActivateSystemStop(UserRole.system_admin)).toBe(true);
    expect(canActivateSystemStop(UserRole.admin)).toBe(false);
  });

  it('keeps organization stops tenant scoped', () => {
    expect(
      resolveStopOrganization(
        { role: UserRole.system_admin, organizationId: 'system' },
        'organization',
        'requested',
      ),
    ).toBe('requested');
    expect(
      resolveStopOrganization(
        { role: UserRole.admin, organizationId: 'own' },
        'organization',
        'requested',
      ),
    ).toBe('own');
    expect(
      resolveStopOrganization({ role: UserRole.system_admin, organizationId: 'system' }, 'system'),
    ).toBeNull();
  });
});
