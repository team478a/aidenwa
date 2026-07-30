import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import type { AuthContext } from '../../types.js';
import { canAssignCompanyOwner, companyScope } from './company.policy.js';

function auth(role: UserRole, userId = 'user-1'): AuthContext {
  return {
    organizationId: 'organization-1',
    userId,
    role,
    sessionId: 'session-1',
    csrfTokenHash: 'csrf-hash',
  };
}

describe('company policy', () => {
  it('scopes sales users to owned companies while managers retain organization scope', () => {
    expect(companyScope(auth(UserRole.sales))).toMatchObject({
      organizationId: 'organization-1',
      ownerUserId: 'user-1',
      isDeleted: false,
    });
    expect(companyScope(auth(UserRole.manager))).toEqual({
      organizationId: 'organization-1',
      isDeleted: false,
    });
  });

  it('prevents sales users from assigning a company to another user', () => {
    expect(canAssignCompanyOwner(auth(UserRole.sales), 'user-2')).toBe(false);
    expect(canAssignCompanyOwner(auth(UserRole.sales), 'user-1')).toBe(true);
    expect(canAssignCompanyOwner(auth(UserRole.manager), 'user-2')).toBe(true);
  });
});
