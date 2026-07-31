import { describe, expect, it } from 'vitest';
import { UserRole } from '@sales-ai/database';
import { maskedPhone, resolveAllowlistOrganization } from './allowlist.policy.js';

describe('test allowlist policy', () => {
  it('masks phone numbers and keeps tenant selection privileged', () => {
    expect(maskedPhone('1234')).toBe('********1234');
    expect(
      resolveAllowlistOrganization({ role: UserRole.admin, organizationId: 'own' }, 'requested'),
    ).toBe('own');
    expect(
      resolveAllowlistOrganization(
        { role: UserRole.system_admin, organizationId: 'system' },
        'requested',
      ),
    ).toBe('requested');
  });
});
