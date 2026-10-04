import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';
import { config } from '../config.js';

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.path}`, { code: 'NOT_FOUND' }));
}

function fieldErrors(zerr) {
  const out = {};
  for (const issue of zerr.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// PostgreSQL error codes -> friendly API errors
function fromPg(err) {
  switch (err.code) {
    case '23505': { // unique_violation
      const c = err.constraint || '';
      if (c === 'users_email_key') return new HttpError(409, 'That email address is already in use', { code: 'CONFLICT', details: { email: 'Already in use' } });
      if (c === 'users_username_key') return new HttpError(409, 'That username is already taken', { code: 'CONFLICT', details: { username: 'Already taken' } });
      if (c === 'caller_contacts_dedupe_key') return new HttpError(409, 'This contact already exists in that phonebook', { code: 'DUPLICATE' });
      return new HttpError(409, 'A record with those details already exists', { code: 'CONFLICT' });
    }
    case '23503': return new HttpError(409, 'This record is referenced by other data or points to something that does not exist', { code: 'CONFLICT' });
    case '23514':
      if (err.constraint === 'profiles_death_after_birth') return new HttpError(422, 'Date of death cannot be before date of birth', { code: 'VALIDATION_ERROR', details: { dateOfDeath: 'Cannot be before the date of birth' } });
      return new HttpError(422, 'A value is not allowed', { code: 'VALIDATION_ERROR' });
    case '22P02':
    case '22007':
    case '22008': return new HttpError(400, 'Invalid value in request', { code: 'BAD_REQUEST' });
    default: return null;
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let e = err;
  if (err instanceof ZodError) {
    e = new HttpError(422, 'Please correct the highlighted fields', { code: 'VALIDATION_ERROR', details: fieldErrors(err) });
  } else if (err?.type === 'entity.too.large') {
    e = new HttpError(413, 'Request body is too large', { code: 'PAYLOAD_TOO_LARGE' });
  } else if (err?.type === 'entity.parse.failed') {
    e = new HttpError(400, 'Request body is not valid JSON', { code: 'BAD_REQUEST' });
  } else if (err?.code && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
    e = fromPg(err) || err;
  }

  if (!(e instanceof HttpError)) {
    // Never leak internals or request data (which may contain passwords) to clients or logs.
    console.error(`[error] ${req.method} ${req.path}:`, e?.message || e);
    if (!config.isProd && e?.stack) console.error(e.stack);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' } });
  }
  res.status(e.status).json({ error: { code: e.code || 'ERROR', message: e.message, ...(e.details ? { details: e.details } : {}) } });
}
