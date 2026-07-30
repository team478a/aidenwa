import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import { tagMutationRoles } from './tag.policy.js';

describe('tag policy', () => {
  it('limits tag mutations to administrators and managers', () => {
    expect(tagMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
    expect(tagMutationRoles).not.toContain(UserRole.sales);
  });
});
