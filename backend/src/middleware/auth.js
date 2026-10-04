import { config } from '../config.js';
import { query } from '../db/pool.js';
import { verifyToken } from '../utils/jwt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { unauthorized, forbidden } from '../utils/httpError.js';

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
              profile_id, theme, preferences, last_login_at, created_at
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
