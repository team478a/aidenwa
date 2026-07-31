import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';

import { productMutationRoles } from './product.policy.js';

describe('product policy', () => {
  it('limits product mutations to administrators and managers', () => {
    expect(productMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
    expect(productMutationRoles).not.toContain(UserRole.sales);
  });
});
