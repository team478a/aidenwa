import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import { optOutAuditData, optOutReleaseRoles } from './opt-out.policy.js';

describe('opt-out policy', () => {
  it('limits release to administrators', () => {
    expect(optOutReleaseRoles).toEqual([UserRole.admin]);
  });

  it('excludes phone and email snapshots from audit data', () => {
    const source = {
      id: 'opt-out-1',
      companyId: 'company-1',
      phoneNumberId: 'phone-1',
      contactId: 'contact-1',
      scope: 'phone',
      channel: 'phone',
      status: 'active',
      reasonCode: 'customer_request',
      releaseReason: null,
      normalizedPhoneSnapshot: '+819012345678',
      emailSnapshot: 'secret@example.com',
    };
    const audit = optOutAuditData(source);
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('+819012345678');
    expect(serialized).not.toContain('secret@example.com');
    expect(audit).not.toHaveProperty('normalizedPhoneSnapshot');
    expect(audit).not.toHaveProperty('emailSnapshot');
  });
});
