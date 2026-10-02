import { query } from '../db/pool.js';
import { config } from '../config.js';
import { hashPassword } from '../utils/password.js';
import { adminUserCreateSchema } from '../utils/schemas.js';

/**
 * Creates the first administrator from BOOTSTRAP_ADMIN_* environment variables.
 * Idempotent: if a user with that email already exists nothing is changed (the password is NEVER overwritten).
 * Public registration can only ever create role USER; this and the Admin Panel are the only ways to get an ADMIN.
 */
export async function bootstrapAdmin({ email, username, password, name } = config.bootstrapAdmin) {
  const parsed = adminUserCreateSchema.parse({
    email, username, password, displayName: name, role: 'ADMIN', mustChangePassword: false,
  });
  const existing = await query('SELECT id FROM users WHERE lower(email) = $1 OR lower(username) = lower($2)', [parsed.email, parsed.username]);
  if (existing.rows.length) return { created: false, email: parsed.email };
  const hash = await hashPassword(parsed.password);
  await query(
    `INSERT INTO users (email, username, display_name, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4, 'ADMIN', false)`,
    [parsed.email, parsed.username, parsed.displayName, hash],
  );
  return { created: true, email: parsed.email };
}
