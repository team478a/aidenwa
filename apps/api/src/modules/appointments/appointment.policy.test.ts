import { describe, expect, it } from 'vitest';
import { UserRole } from '@sales-ai/database';
import type { AuthContext } from '../../types.js';
import { appointmentScope, canAccessAssignee } from './appointment.policy.js';

const auth = (role: UserRole, userId = 'user-1'): AuthContext => ({
  sessionId: 'session-1',
  organizationId: 'organization-1',
  userId,
  role,
  csrfTokenHash: 'hash',
});

describe('appointment policy', () => {
  it('limits sales reads and writes to their own assignee scope', () => {
    const sales = auth(UserRole.sales);
    expect(canAccessAssignee(sales, 'user-1')).toBe(true);
    expect(canAccessAssignee(sales, 'user-2')).toBe(false);
    expect(appointmentScope(sales, 'appointment-1')).toEqual({
      id: 'appointment-1',
      organizationId: 'organization-1',
      assigneeUserId: 'user-1',
    });
  });

  it('keeps manager access organization-wide without accepting a client organization id', () => {
    const manager = auth(UserRole.manager);
    expect(canAccessAssignee(manager, 'user-2')).toBe(true);
    expect(appointmentScope(manager)).toEqual({ organizationId: 'organization-1' });
  });
});
