import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface FieldError {
  field?: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldError[],
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthenticated = (message = 'Authentication required.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (message = 'Resource not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const validation = (fieldErrors: FieldError[]) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed.', fieldErrors);
export const rateLimited = (retryAfterSeconds: number) =>
  new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', undefined, {
    'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
  });
