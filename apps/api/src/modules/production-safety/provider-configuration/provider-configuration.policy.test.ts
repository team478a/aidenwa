import { describe, expect, it } from 'vitest';
import { providerConfigurationAudit } from './provider-configuration.policy.js';

describe('provider configuration policy', () => {
  it('always projects production as disabled and hides secret references', () => {
    expect(
      providerConfigurationAudit({
        provider: 'mock',
        allowed: true,
        secretReferenceKey: 'secret/path',
      }),
    ).toEqual({
      provider: 'mock',
      allowed: true,
      productionEnabled: false,
      hasSecretReference: true,
    });
  });
});
