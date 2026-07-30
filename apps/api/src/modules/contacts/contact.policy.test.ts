import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import type { AuthContext } from '../../types.js';
import { contactCompanyScope } from './contact.policy.js';

function auth(role: UserRole): AuthContext {
  return {
    organizationId: 'organization-1',
    userId: 'user-1',
    role,
    sessionId: 'session-1',
    csrfTokenHash: 'csrf-hash',
  };
}

describe('contact company scope', () => {
  it('inherits sales ownership and manager organization scope', () => {
    expect(contactCompanyScope(auth(UserRole.sales))).toMatchObject({
      organizationId: 'organization-1',
      ownerUserId: 'user-1',
    });
    expect(contactCompanyScope(auth(UserRole.manager))).toEqual({
      organizationId: 'organization-1',
      isDeleted: false,
    });
  });
});
