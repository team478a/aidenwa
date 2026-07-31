import { UserRole } from '@sales-ai/database';

export const providerConfigurationRoles = [UserRole.system_admin] as const;

export function providerConfigurationAudit(config: {
  provider: string;
  allowed: boolean;
  secretReferenceKey: string | null;
}) {
  return {
    provider: config.provider,
    allowed: config.allowed,
    productionEnabled: false,
    hasSecretReference: Boolean(config.secretReferenceKey),
  };
}
