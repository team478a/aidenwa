import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import { aiAgentMutationRoles } from './ai-agent.policy.js';

describe('AI agent policy', () => {
  it('limits mutations to administrators and managers', () => {
    expect(aiAgentMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
    expect(aiAgentMutationRoles).not.toContain(UserRole.sales);
  });
});
