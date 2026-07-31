import { describe, expect, it } from 'vitest';
import { UserRole } from '@sales-ai/database';
import { resolveGateOrganization } from './gate-decision.policy.js';
describe('production gate policy', () => {
  it('restricts cross-organization selection', () => {
    expect(resolveGateOrganization({ role: UserRole.manager, organizationId: 'own' }, 'x')).toBe(
      'own',
    );
  });
});
