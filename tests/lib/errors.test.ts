import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/lib/errors';

describe('error hierarchy', () => {
  it('creates AppError instances with metadata', () => {
    const details = { field: 'email' };
    const error = new AppError('Validation failed', { code: 'VALIDATION_ERROR', details });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toBe(details);
  });

  it('creates HttpError instances with an HTTP status', () => {
    const error = new HttpError(418, 'Teapot', { code: 'TEAPOT' });

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(418);
    expect(error.message).toBe('Teapot');
    expect(error.code).toBe('TEAPOT');
  });

  it.each([
    [BadRequestError, 400, 'Bad Request'],
    [UnauthorizedError, 401, 'Unauthorized'],
    [ForbiddenError, 403, 'Forbidden'],
    [NotFoundError, 404, 'Not Found'],
    [ConflictError, 409, 'Conflict'],
    [InternalServerError, 500, 'Internal Server Error'],
  ])('creates %p with the expected default status', (ErrorClass, status, defaultMessage) => {
    const error = new ErrorClass();

    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(status);
    expect(error.message).toBe(defaultMessage);
  });

  it('supports custom messages and details on specialized errors', () => {
    const error = new ForbiddenError('Missing role', {
      code: 'ROLE_REQUIRED',
      details: { role: 'admin' },
    });

    expect(error.status).toBe(403);
    expect(error.message).toBe('Missing role');
    expect(error.code).toBe('ROLE_REQUIRED');
    expect(error.details).toEqual({ role: 'admin' });
  });
});
