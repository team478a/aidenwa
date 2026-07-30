import { describe, expect, it } from 'vitest';

import { callableValue, phoneAuditData } from './phone-number.policy.js';

describe('phone number policy', () => {
  it('always makes FAX numbers non-callable', () => {
    expect(callableValue('fax', true, true)).toBe(false);
    expect(callableValue('main', true, true)).toBe(true);
    expect(callableValue('main', true, false)).toBe(false);
  });

  it('projects audit data without a full phone number', () => {
    const audit = phoneAuditData({
      id: 'phone-1',
      companyId: 'company-1',
      contactId: null,
      type: 'main',
      isPrimary: true,
      isValid: true,
      isCallable: true,
      normalizedNumber: '+819012345678',
    });
    expect(JSON.stringify(audit)).not.toContain('+819012345678');
    expect(audit.maskedNumber).toContain('****');
    expect(audit).not.toHaveProperty('rawNumber');
    expect(audit).not.toHaveProperty('normalizedNumber');
  });
});
