import type { ProblemDetails } from '@tap/contracts';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface FieldValidationIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly title: string;
  public readonly errors?: FieldValidationIssue[];

  constructor(params: {
    status: number;
    code: ErrorCode;
    title: string;
    detail: string;
    errors?: FieldValidationIssue[];
    cause?: unknown;
  }) {
    super(params.detail, params.cause !== undefined ? { cause: params.cause } : undefined);
    this.name = new.target.name;
    this.status = params.status;
    this.code = params.code;
    this.title = params.title;
    this.errors = params.errors;
  }

  toProblemDetails(requestId?: string): ProblemDetails {
    return {
      type: `https://tap.local/problems/${this.code.toLowerCase().replaceAll('_', '-')}`,
      title: this.title,
      status: this.status,
      detail: this.message,
      code: this.code,
      ...(requestId ? { requestId } : {}),
      ...(this.errors && this.errors.length > 0 ? { errors: this.errors } : {}),
    };
  }
}

export class ValidationError extends AppError {
  constructor(detail: string, errors?: FieldValidationIssue[]) {
    super({
      status: 400,
      code: 'VALIDATION_ERROR',
      title: 'Datos de entrada inválidos',
      detail,
      errors,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Debes iniciar sesión para realizar esta acción.') {
    super({
      status: 401,
      code: 'UNAUTHORIZED',
      title: 'No autenticado',
      detail,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'No tienes permisos para realizar esta acción.') {
    super({
      status: 403,
      code: 'FORBIDDEN',
      title: 'Acceso denegado',
      detail,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'El recurso solicitado no existe.') {
    super({
      status: 404,
      code: 'NOT_FOUND',
      title: 'Recurso no encontrado',
      detail,
    });
  }
}

export class ConflictError extends AppError {
  constructor(detail: string) {
    super({
      status: 409,
      code: 'CONFLICT',
      title: 'Conflicto de estado',
      detail,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(detail = 'Demasiados intentos. Espera unos segundos e inténtalo de nuevo.') {
    super({
      status: 429,
      code: 'RATE_LIMITED',
      title: 'Límite de solicitudes excedido',
      detail,
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(detail = 'El servicio no está disponible temporalmente.') {
    super({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      title: 'Servicio no disponible',
      detail,
    });
  }
}
