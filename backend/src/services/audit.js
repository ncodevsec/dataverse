import { query } from '../db/pool.js';
import { clientIp } from '../middleware/rateLimit.js';

const SENSITIVE = /pass(word)?|token|hash|secret/i;

function scrub(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : scrub(v, depth + 1)]));
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

/**
 * Records an important action. Audit failures are logged but never break the request that triggered them.
 * Details are scrubbed so passwords/tokens/hashes can never reach the audit table.
 */
export async function audit(req, action, { entityType = null, entityId = null, summary = null, details = {} } = {}) {
  try {
    const actor = req.user;
    await query(
      `INSERT INTO audit_logs (actor_id, actor_label, action, entity_type, entity_id, summary, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [actor?.id ?? null, actor ? `${actor.display_name} <${actor.email}>` : 'system', action, entityType,
        entityId == null ? null : String(entityId), summary, JSON.stringify(scrub(details)), clientIp(req)],
    );
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}
