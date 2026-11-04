// server/src/common/errors.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string): AppError;
  static badRequest(code: string, message: string, details?: unknown): AppError;
  static badRequest(codeOrMessage: string, message?: string, details?: unknown) {
    return message
      ? new AppError(400, codeOrMessage, message, details)
      : new AppError(400, 'BAD_REQUEST', codeOrMessage, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Insufficient permissions for this operation') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(entity: string, id?: string) {
    return new AppError(404, 'NOT_FOUND', `${entity}${id ? ` (${id})` : ''} not found`);
  }
  static conflict(message: string): AppError;
  static conflict(code: string, message: string, details?: unknown): AppError;
  static conflict(codeOrMessage: string, message?: string, details?: unknown) {
    return message
      ? new AppError(409, codeOrMessage, message, details)
      : new AppError(409, 'CONFLICT', codeOrMessage, details);
  }
  static unprocessable(code: string, message: string, details?: unknown) {
    return new AppError(422, code, message, details);
  }
  static validation(message: string, details?: unknown) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }
  static internal(message: string) {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}