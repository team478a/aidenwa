import { describe, expect, it } from 'vitest';
import { externalCallSchema, updateIntegrationClientSchema } from './schemas.js';
import { hashApiKey, issueApiKey, requestFingerprint } from './security.js';

const validCall = {
  external_call_id: 'crm-call-000123',
  external_customer_id: 'customer-9876',
  call_profile_id: 'cp_new_sales_v1',
  destination: { phone: '0312345678' },
  customer: { company_name: 'Example Company', contact_name: 'Test User' },
  context: { industry: 'manufacturing' },
  execution: { mode: 'scheduled', scheduled_at: '2026-08-20T14:00:00+09:00' },
} as const;

describe('headless integration security', () => {
  it('issues environment-specific keys and only derives a hash for persistence', () => {
    const sandbox = issueApiKey('sandbox');
    const production = issueApiKey('production');

    expect(sandbox.apiKey).toMatch(/^aid_test_/u);
    expect(production.apiKey).toMatch(/^aid_live_/u);
    expect(sandbox.apiKeyHash).toBe(hashApiKey(sandbox.apiKey));
    expect(sandbox.apiKeyHash).not.toContain(sandbox.apiKey);
  });

  it('accepts an ISO timestamp with an explicit timezone offset', () => {
    expect(externalCallSchema.safeParse(validCall).success).toBe(true);
  });

  it.each(['ignore_opt_out', 'skip_production_gate', 'system_prompt'])(
    'rejects the forbidden field %s instead of ignoring it',
    (field) => {
      const result = externalCallSchema.safeParse({ ...validCall, [field]: true });
      expect(result.success).toBe(false);
    },
  );

  it('rejects oversized call context', () => {
    const context = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [`key_${index}`, 'value']),
    );
    expect(externalCallSchema.safeParse({ ...validCall, context }).success).toBe(false);
  });

  it('produces the same request fingerprint for the same parsed request', () => {
    const parsed = externalCallSchema.parse(validCall);
    expect(requestFingerprint(parsed)).toBe(requestFingerprint(parsed));
  });

  it('makes a previously issued API key invalid after rotation', () => {
    const previous = issueApiKey('sandbox');
    const rotated = issueApiKey('sandbox');
    expect(hashApiKey(previous.apiKey)).not.toBe(rotated.apiKeyHash);
    expect(hashApiKey(rotated.apiKey)).toBe(rotated.apiKeyHash);
  });

  it('strictly validates client updates and permits an explicit suspension', () => {
    expect(updateIntegrationClientSchema.parse({ status: 'suspended' })).toEqual({
      status: 'suspended',
    });
    expect(updateIntegrationClientSchema.safeParse({}).success).toBe(false);
    expect(
      updateIntegrationClientSchema.safeParse({ status: 'active', skip_production_gate: true })
        .success,
    ).toBe(false);
  });
});
