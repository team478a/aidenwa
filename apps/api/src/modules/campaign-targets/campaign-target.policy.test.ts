import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';
import { campaignTargetMutationRoles } from './campaign-target.policy.js';

describe('campaign target policy', () => {
  it('limits target preparation to administrators and managers', () => {
    expect(campaignTargetMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
  });
});
