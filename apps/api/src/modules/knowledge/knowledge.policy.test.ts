import { UserRole } from '@sales-ai/database';
import { describe, expect, it } from 'vitest';
import { knowledgeMutationRoles } from './knowledge.policy.js';

describe('knowledge policy', () => {
  it('limits mutations to administrators and managers', () => {
    expect(knowledgeMutationRoles).toEqual([UserRole.admin, UserRole.manager]);
  });
});
