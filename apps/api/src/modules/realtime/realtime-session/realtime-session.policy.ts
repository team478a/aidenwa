import { UserRole } from '@sales-ai/database';

export const realtimeSessionReadRoles = [
  UserRole.system_admin,
  UserRole.admin,
  UserRole.manager,
] as const;
export const realtimeSessionTerminateRoles = [UserRole.system_admin, UserRole.admin] as const;
export const terminableRealtimeStatuses = ['reserved', 'connecting', 'active', 'ending'] as const;
