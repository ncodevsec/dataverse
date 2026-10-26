import { query } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

export function clientIp(req) {
  // Only trust a platform header on the platform that sets (and overwrites) it; on any other host a client could spoof it.
  // Netlify: x-nf-client-connection-ip. Vercel: x-vercel-forwarded-for. Elsewhere: Express' trusted-proxy aware req.ip.
  const platformIp = process.env.NETLIFY ? req.headers['x-nf-client-connection-ip']
    : process.env.VERCEL ? req.headers['x-vercel-forwarded-for']
    : undefined;
  return (typeof platformIp === 'string' && platformIp.split(',')[0].trim()) || req.ip || 'unknown';
}

/**
 * Fixed-window rate limiter backed by PostgreSQL so limits are shared by every serverless instance
 * (an in-memory limiter would reset on each cold start and be per-instance).
 *
 * keyFn(req) -> string|null  (null skips the limiter)
 */
export function rateLimit({ name, windowMs, max, keyFn = clientIp, message = 'Too many attempts. Please try again later.' }) {
  return async (req, res, next) => {
    try {
      const k = keyFn(req);
      if (!k) return next();
      const key = `${name}:${k}`;
      const { rows } = await query(
        `INSERT INTO rate_limits (key, hits, reset_at) VALUES ($1, 1, now() + ($2 || ' milliseconds')::interval)
         ON CONFLICT (key) DO UPDATE SET
           hits     = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
           reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + ($2 || ' milliseconds')::interval ELSE rate_limits.reset_at END
         RETURNING hits, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - now()))))::int AS retry_after`,
        [key, String(windowMs)],
      );
      const { hits, retry_after: retryAfter } = rows[0];
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - hits)));
      if (hits > max) {
        res.setHeader('Retry-After', String(retryAfter));
        return next(new HttpError(429, message, { code: 'RATE_LIMITED' }));
      }
      // opportunistic cleanup of expired rows (~1% of requests)
      if (Math.random() < 0.01) query('DELETE FROM rate_limits WHERE reset_at < now() - interval \'1 hour\'').catch(() => {});
      next();
    } catch (err) {
      next(err);
    }
  };
}
