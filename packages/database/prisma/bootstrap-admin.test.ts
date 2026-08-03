import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_CONFIRMATION, parseBootstrapAdminInput } from './bootstrap-admin.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://example:example@localhost:5432/example',
  BOOTSTRAP_ADMIN_CONFIRM: BOOTSTRAP_CONFIRMATION,
  BOOTSTRAP_ORGANIZATION_NAME: '合成テスト組織',
  BOOTSTRAP_ORGANIZATION_SLUG: 'railway-smoke',
  BOOTSTRAP_ADMIN_NAME: '初期管理者',
  BOOTSTRAP_ADMIN_EMAIL: 'ADMIN@EXAMPLE.TEST',
  BOOTSTRAP_ADMIN_PASSWORD: 'Synthetic-Admin-Password!',
};

describe('initial administrator bootstrap input', () => {
  it('normalizes the email and accepts an explicit confirmation', () => {
    expect(parseBootstrapAdminInput(validEnvironment)).toMatchObject({
      BOOTSTRAP_ADMIN_EMAIL: 'admin@example.test',
      BOOTSTRAP_ADMIN_CONFIRM: BOOTSTRAP_CONFIRMATION,
    });
  });

  it('rejects a missing confirmation and weak password', () => {
    expect(() =>
      parseBootstrapAdminInput({
        ...validEnvironment,
        BOOTSTRAP_ADMIN_CONFIRM: '',
        BOOTSTRAP_ADMIN_PASSWORD: 'short',
      }),
    ).toThrow();
  });

  it('rejects unsafe organization slugs and non-PostgreSQL URLs', () => {
    expect(() =>
      parseBootstrapAdminInput({
        ...validEnvironment,
        DATABASE_URL: 'https://example.test/database',
        BOOTSTRAP_ORGANIZATION_SLUG: '../unsafe',
      }),
    ).toThrow();
  });
});
