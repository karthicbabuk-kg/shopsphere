export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  static badRequest = (m: string, d?: unknown) => new AppError(400, 'BAD_REQUEST', m, d);
  static unauthorized = (m = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', m);
  static forbidden = (m = 'You do not have access to this resource') =>
    new AppError(403, 'FORBIDDEN', m);
  static notFound = (m = 'Resource not found') => new AppError(404, 'NOT_FOUND', m);
  static conflict = (m: string, d?: unknown) => new AppError(409, 'CONFLICT', m, d);
}
