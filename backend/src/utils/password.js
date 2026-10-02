import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// bcryptjs is the pure-JS bcrypt implementation: same algorithm and hash format as native bcrypt,
// but no native build step, which keeps Netlify Functions deploys reliable.
export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Used to burn the same CPU time when a login identifier does not exist (prevents user enumeration by timing).
export const DUMMY_HASH = bcrypt.hashSync('dataverse-timing-pad', 10);

/** 16 URL-safe characters with letters + digits; shown to an admin exactly once. */
export function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
