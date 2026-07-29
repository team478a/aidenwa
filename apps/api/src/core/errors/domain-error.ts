type DomainErrorOptions = {
  code: string;
  httpStatus: number;
  message: string;
  details?: Record<string, unknown>;
};

export class DomainError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor({ code, httpStatus, message, details }: DomainErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

type ErrorOverrides = {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export class NotFoundError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'NOT_FOUND',
      httpStatus: 404,
      message: overrides.message ?? '対象が見つかりません',
      details: overrides.details,
    });
  }
}

export class ForbiddenError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'FORBIDDEN',
      httpStatus: 403,
      message: overrides.message ?? '操作する権限がありません',
      details: overrides.details,
    });
  }
}

export class ConflictError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'CONFLICT',
      httpStatus: 409,
      message: overrides.message ?? '現在の状態では操作できません',
      details: overrides.details,
    });
  }
}

export class InvalidStateError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'INVALID_STATE',
      httpStatus: 409,
      message: overrides.message ?? '状態遷移が不正です',
      details: overrides.details,
    });
  }
}

export class ValidationDomainError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'VALIDATION_ERROR',
      httpStatus: 400,
      message: overrides.message ?? '入力内容を確認してください',
      details: overrides.details,
    });
  }
}

export class TenantScopeError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'FORBIDDEN',
      httpStatus: 403,
      message: overrides.message ?? '操作する権限がありません',
      details: overrides.details,
    });
  }
}

export class ExternalProviderDisabledError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'PRODUCTION_DISABLED',
      httpStatus: 409,
      message: overrides.message ?? '外部Providerは無効です',
      details: overrides.details,
    });
  }
}

export class RetryableInfrastructureError extends DomainError {
  constructor(overrides: ErrorOverrides = {}) {
    super({
      code: overrides.code ?? 'SERVICE_UNAVAILABLE',
      httpStatus: 503,
      message: overrides.message ?? '一時的に処理できません',
      details: overrides.details,
    });
  }
}
