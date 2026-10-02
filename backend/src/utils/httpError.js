export class HttpError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (m = 'Bad request', details) => new HttpError(400, m, { code: 'BAD_REQUEST', details });
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, { code: 'UNAUTHORIZED' });
export const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m, { code: 'FORBIDDEN' });
export const notFound = (m = 'Not found') => new HttpError(404, m, { code: 'NOT_FOUND' });
export const conflict = (m = 'Conflict', details) => new HttpError(409, m, { code: 'CONFLICT', details });
