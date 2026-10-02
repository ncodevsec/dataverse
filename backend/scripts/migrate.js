#!/usr/bin/env node
// Minimal forward-only SQL migration runner: applies database/migrations/*.sql in filename order,
// each inside a transaction, and records them in schema_migrations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertConfig } from '../src/config.js';
import { getPool, closePool } from '../src/db/pool.js';
import { bootstrapAdmin } from '../src/services/bootstrapAdmin.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

async function main() {
  if (!config.db.url) throw new Error('DATABASE_URL is not set');
  const client = await getPool().connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      console.log(`> applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    console.log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
  } finally {
    client.release();
  }

  // Optional: create the first admin when BOOTSTRAP_ADMIN_* variables are present.
  if (config.bootstrapAdmin.email && config.bootstrapAdmin.password) {
    assertConfig();
    const result = await bootstrapAdmin();
    console.log(result.created ? `Bootstrap admin created: ${result.email}` : `Bootstrap admin already exists: ${result.email}`);
  }
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(closePool);
