import { UserRole } from '@sales-ai/database';

export const callJobMutationRoles = [UserRole.admin, UserRole.manager] as const;
export const cancellableCallJobStatuses = ['queued', 'reserved', 'dispatching'] as const;

export function canUseMockCallFixture(nodeEnv: string) {
  return nodeEnv !== 'production';
}
