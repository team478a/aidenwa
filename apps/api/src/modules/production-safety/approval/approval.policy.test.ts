import { describe, expect, it } from 'vitest';
import { UserRole } from '@sales-ai/database';

import { canTransitionApproval, resolveApprovalOrganization } from './approval.policy.js';

describe('production approval policy', () => {
  it('keeps decision transitions bounded', () => {
    expect(canTransitionApproval('reviewing', 'approve')).toBe(true);
    expect(canTransitionApproval('reviewing', 'reject')).toBe(true);
    expect(canTransitionApproval('approved', 'suspend')).toBe(true);
    expect(canTransitionApproval('suspended', 'resume')).toBe(true);
    expect(canTransitionApproval('draft', 'approve')).toBe(false);
  });

  it('limits cross-organization selection to system administrators', () => {
    expect(
      resolveApprovalOrganization(
        { role: UserRole.system_admin, organizationId: 'system' },
        'requested',
      ),
    ).toBe('requested');
    expect(
      resolveApprovalOrganization({ role: UserRole.admin, organizationId: 'own' }, 'requested'),
    ).toBe('own');
  });
});
