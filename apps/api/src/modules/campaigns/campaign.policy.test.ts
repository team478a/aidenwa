import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';
import {
  campaignMutationRoles,
  campaignStatusFor,
  canTransitionCampaign,
} from './campaign.policy.js';

describe('campaign policy', () => {
  it('preserves mutation roles and state transitions', () => {
    expect(campaignMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
    expect(canTransitionCampaign('start', 'ready')).toBe(true);
    expect(canTransitionCampaign('start', 'draft')).toBe(false);
    expect(campaignStatusFor('resume')).toBe('running');
    expect(campaignStatusFor('cancel')).toBe('cancelled');
  });
});
