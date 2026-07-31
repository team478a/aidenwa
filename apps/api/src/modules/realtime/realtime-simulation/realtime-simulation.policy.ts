import { UserRole } from '@sales-ai/database';

export const realtimeSimulationRoles = [UserRole.system_admin] as const;

export function canExposeRealtimeSimulation(nodeEnv: string) {
  return nodeEnv !== 'production';
}
