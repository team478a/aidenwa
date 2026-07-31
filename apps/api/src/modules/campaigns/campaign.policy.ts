import { UserRole } from '@sales-ai/database';

export const campaignMutationRoles = [UserRole.admin, UserRole.manager] as const;

export type CampaignAction = 'validate' | 'approve' | 'start' | 'pause' | 'resume' | 'cancel';

const allowedStates: Record<CampaignAction, readonly string[]> = {
  validate: ['draft'],
  approve: ['ready'],
  start: ['ready'],
  pause: ['running'],
  resume: ['paused'],
  cancel: ['draft', 'ready', 'running', 'paused'],
};

export function canTransitionCampaign(action: CampaignAction, status: string) {
  return allowedStates[action].includes(status);
}

export function campaignStatusFor(action: CampaignAction) {
  if (action === 'validate' || action === 'approve') return 'ready';
  if (action === 'start' || action === 'resume') return 'running';
  if (action === 'pause') return 'paused';
  return 'cancelled';
}
