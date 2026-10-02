import pg from 'pg';
import { config } from '../config.js';

// DATE columns come back as 'YYYY-MM-DD' strings (no timezone shifting); bigint (count(*), audit ids) as numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

let pool;

function sslOption(connectionString) {
  if (config.db.ssl === 'false') return false;
  if (config.db.ssl === 'true') return { rejectUnauthorized: config.db.rejectUnauthorized };
  // auto: encrypt everything except local databases
  const host = new URL(connectionString).hostname;
  const local = ['localhost', '127.0.0.1', '::1', 'db', 'postgres'].includes(host);
  return local ? false : { rejectUnauthorized: config.db.rejectUnauthorized };
}

/**
 * Lazily creates ONE pool per process. In a serverless function the module scope survives between
 * warm invocations, so the pool is reused; poolMax defaults to 1 there to respect provider limits.
 */
export function getPool() {
  if (pool) return pool;
  if (!config.db.url) throw new Error('DATABASE_URL is not set');
  const url = new URL(config.db.url);
  // We configure TLS ourselves; drop sslmode so pg does not override it.
  url.searchParams.delete('sslmode');
  pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: sslOption(config.db.url),
    max: config.db.poolMax,
    idleTimeoutMillis: config.isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 8_000,
    allowExitOnIdle: config.isServerless,
  });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  return pool;
}

export const query = (text, params) => getPool().query(text, params);

/** Runs fn(client) inside a transaction; commits on success, rolls back on any error. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) { await pool.end(); pool = undefined; }
}
