import { describe, expect, it } from 'vitest';
import {
  DomainError,
  ExternalProviderDisabledError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  RetryableInfrastructureError,
  TenantScopeError,
  ValidationDomainError,
} from './domain-error.js';
import { toPublicError } from './http-error.js';

describe('toPublicError', () => {
  it.each([
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new InvalidStateError(), 409, 'INVALID_STATE'],
    [new ValidationDomainError(), 400, 'VALIDATION_ERROR'],
    [new TenantScopeError(), 403, 'FORBIDDEN'],
    [new ExternalProviderDisabledError(), 409, 'PRODUCTION_DISABLED'],
    [new RetryableInfrastructureError(), 503, 'SERVICE_UNAVAILABLE'],
  ])('maps %s to its public response', (cause, statusCode, code) => {
    expect(toPublicError(cause)).toMatchObject({
      statusCode,
      body: { error: { code } },
    });
  });

  it('preserves an existing API code and status supplied during gradual migration', () => {
    const cause = new DomainError({
      code: 'FOLLOWUP_VERSION_CONFLICT',
      httpStatus: 409,
      message: 'タスクが更新されています',
    });
    expect(toPublicError(cause)).toEqual({
      statusCode: 409,
      body: {
        error: {
          code: 'FOLLOWUP_VERSION_CONFLICT',
          message: 'タスクが更新されています',
        },
      },
      logCause: false,
    });
  });

  it('never exposes an unknown internal error message', () => {
    const mapped = toPublicError(new Error('secret provider response and phone number'));
    expect(mapped.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: '処理に失敗しました' },
    });
    expect(JSON.stringify(mapped)).not.toContain('secret provider response');
  });

  it('does not include domain details in the HTTP body', () => {
    const mapped = toPublicError(
      new ValidationDomainError({
        details: { internalField: 'raw customer data' },
      }),
    );
    expect(mapped.body.error).not.toHaveProperty('details');
    expect(JSON.stringify(mapped.body)).not.toContain('raw customer data');
  });
});
