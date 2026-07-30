import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import type { AuthContext } from '../../types.js';
import { salesListMutationRoles, salesListPreviewScope } from './sales-list.policy.js';

function auth(role: UserRole): AuthContext {
  return {
    organizationId: 'organization-1',
    userId: 'user-1',
    role,
    sessionId: 'session-1',
    csrfTokenHash: 'csrf-hash',
  };
}

describe('sales list policy', () => {
  it('limits mutations and owner-scopes sales previews', () => {
    expect(salesListMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
    expect(salesListPreviewScope(auth(UserRole.sales), {})).toMatchObject({
      organizationId: 'organization-1',
      ownerUserId: 'user-1',
    });
    expect(salesListPreviewScope(auth(UserRole.manager), {})).not.toHaveProperty('ownerUserId');
  });
});
