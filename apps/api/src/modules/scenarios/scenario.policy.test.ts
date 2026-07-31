import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import { scenarioMutationRoles } from './scenario.policy.js';

describe('scenario policy', () => {
  it('limits mutations to administrators and managers', () => {
    expect(scenarioMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
  });
});
