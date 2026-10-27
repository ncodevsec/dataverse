import { config } from '../config.js';
import { query } from '../db/pool.js';
import { verifyToken } from '../utils/jwt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError, unauthorized, forbidden } from '../utils/httpError.js';
import { verifyPassword } from '../utils/password.js';
import { audit } from '../services/audit.js';

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/**
 * Reads the JWT from the HttpOnly session cookie (browser) or an `Authorization: Bearer` header (API clients),
 * then loads the user from the database on every request. Because the database is the source of truth,
 * deactivating a user, changing a role or changing a password takes effect immediately (token_version).
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || readCookie(req, config.cookie.name);
  req.authVia = bearer ? 'bearer' : 'cookie';
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const { rows } = await query(
      `SELECT id, email, username, display_name, role, is_active, must_change_password, token_version, approval_status,
              people_id, theme, preferences, last_login_at, created_at
         FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    if (user && user.is_active && user.approval_status === 'APPROVED' && user.token_version === payload.tv) req.user = user;
  } catch {
    // invalid / expired token => treated as anonymous
  }
  next();
});

/**
 * CSRF defence for cookie sessions: browsers cannot attach a custom header to a cross-site request without a
 * CORS preflight, and our CORS policy only allows configured origins. SameSite=Lax on the cookie is the second layer.
 */
export function csrfGuard(req, _res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safe || req.authVia === 'bearer') return next();
  if (req.headers['x-requested-with'] === 'dataverse') return next();
  next(forbidden('Missing CSRF header'));
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden('Administrator access required'));
  next();
};

export const requireAdmin = requireRole('ADMIN');

/** Adds a few capability helpers for use by controllers. */
export const isAdmin = (user) => user?.role === 'ADMIN';

/**
 * Step-up authentication for destructive / highly sensitive actions: even a signed-in administrator must send their own
 * password again (header X-Confirm-Password, base64 of the UTF-8 password). Only FAILED confirmations are throttled
 * (5 per 15 minutes per account, then locked out for the rest of the window) and every failure is audited.
 * The verified password is exposed as req.reauthPassword (used to encrypt backups) and never stored or logged.
 */
const FAIL_MAX = 5;
const failKey = (userId) => `reauth-fail:${userId}`;
const verifyReauth = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw unauthorized();
  const key = failKey(req.user.id);
  const { rows: fails } = await query('SELECT hits FROM rate_limits WHERE key = $1 AND reset_at > now()', [key]);
  if ((fails[0]?.hits ?? 0) >= FAIL_MAX) throw new HttpError(429, 'Too many wrong password confirmations. Try again in a few minutes.', { code: 'RATE_LIMITED' });
  const raw = req.headers['x-confirm-password'];
  if (!raw) throw new HttpError(403, 'Please confirm your password to continue', { code: 'REAUTH_REQUIRED' });
  let pw = '';
  try { pw = Buffer.from(String(raw), 'base64').toString('utf8'); } catch { /* treated as wrong */ }
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!pw || !rows[0] || !(await verifyPassword(pw, rows[0].password_hash))) {
    await query(
      `INSERT INTO rate_limits (key, hits, reset_at) VALUES ($1, 1, now() + interval '15 minutes')
       ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + interval '15 minutes' ELSE rate_limits.reset_at END`, [key]);
    await audit(req, 'security.reauth_failed', { entityType: 'user', entityId: req.user.id, summary: `Wrong password confirmation for ${req.method} ${req.baseUrl}${req.path}` });
    throw new HttpError(403, 'That password is not correct', { code: 'REAUTH_FAILED' });
  }
  if (fails.length) await query('DELETE FROM rate_limits WHERE key = $1', [key]);
  req.reauthPassword = pw;
  next();
});
export const requireReauth = verifyReauth;
/** Same, but only when `needs(req)` is true (e.g. a PATCH that changes a role). */
export const requireReauthWhen = (needs) => (req, res, next) => (needs(req) ? verifyReauth(req, res, next) : next());
