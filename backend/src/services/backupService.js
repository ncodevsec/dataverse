import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { query } from '../db/pool.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Insert order respects foreign keys. `deferred` columns point at tables that are inserted later (users <-> profiles are circular),
// so they are written as NULL first and filled in with UPDATEs once both tables exist.
const TABLES = [
  { name: 'users', pk: 'id', deferred: ['profile_id', 'approved_by'], blank: ['reset_token_hash', 'reset_token_expires_at'] },
  { name: 'profiles', pk: 'id', deferred: ['created_by', 'updated_by', 'father_id', 'mother_id', 'spouse_id'], identity: true },
  { name: 'organizations', pk: 'id', identity: true },
  { name: 'profile_photos', pk: 'profile_id' },
  { name: 'organization_photos', pk: 'organization_id' },
  { name: 'caller_contacts', pk: 'id', identity: true },
  { name: 'posts', pk: 'id', identity: true },
  { name: 'marriages', pk: 'id', identity: true },
  { name: 'memberships', pk: 'id', identity: true },
  { name: 'organization_links', pk: 'id', identity: true },
  { name: 'entity_links_unmapped', pk: 'id' },
  { name: 'site_settings', pk: 'key', upsert: true },
  { name: 'audit_logs', pk: 'id', identity: true },
];
const BATCH = 200;

const str = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** One JS value -> one SQL literal. */
export function sqlValue(v, jsonb = false) {
  if (v === null || v === undefined) return 'NULL';
  if (jsonb) return `${str(JSON.stringify(v))}::jsonb`; // jsonb may hold a bare boolean / number / string
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'::bytea`;
  if (v instanceof Date) return str(v.toISOString());
  if (Array.isArray(v)) return v.length ? `ARRAY[${v.map((x) => str(x)).join(',')}]::text[]` : "'{}'::text[]";
  if (typeof v === 'object') return `${str(JSON.stringify(v))}::jsonb`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return str(v);
}

async function columnsOf(table) {
  const { rows } = await query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER' ORDER BY ordinal_position`, [table]);
  return rows.map((r) => ({ name: r.column_name, jsonb: r.data_type === 'jsonb' }));
}

/** Streams a restorable, data-only SQL dump (run it on a database created by `npm run db:migrate`). */
export async function* dumpSql(stats = {}) {
  yield `-- Dataverse data backup, ${new Date().toISOString()}\n-- Restore into an EMPTY database created with: npm run db:migrate (without BOOTSTRAP_ADMIN_* set)\n-- then: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database.sql\nBEGIN;\n`;
  const fixups = [];
  for (const t of TABLES) {
    const colInfo = await columnsOf(t.name);
    const cols = colInfo.map((c) => c.name);
    const jsonCols = new Set(colInfo.filter((c) => c.jsonb).map((c) => c.name));
    const deferred = new Set(t.deferred || []);
    const blank = new Set(t.blank || []);
    let offset = 0; let count = 0;
    for (;;) {
      const { rows } = await query(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM ${t.name} ORDER BY "${t.pk}" LIMIT ${BATCH} OFFSET ${offset}`);
      if (!rows.length) break;
      const values = rows.map((r) => `(${cols.map((c) => (deferred.has(c) || blank.has(c) ? 'NULL' : sqlValue(r[c], jsonCols.has(c)))).join(',')})`);
      for (const r of rows) {
        const set = [...deferred].filter((c) => r[c] != null).map((c) => `"${c}" = ${sqlValue(r[c])}`);
        if (set.length) fixups.push(`UPDATE ${t.name} SET ${set.join(', ')} WHERE "${t.pk}" = ${sqlValue(r[t.pk])};`);
      }
      const conflict = t.upsert ? ` ON CONFLICT ("${t.pk}") DO UPDATE SET ${cols.filter((c) => c !== t.pk).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')}` : '';
      yield `INSERT INTO ${t.name} (${cols.map((c) => `"${c}"`).join(', ')}) OVERRIDING SYSTEM VALUE VALUES\n${values.join(',\n')}${conflict};\n`;
      count += rows.length; offset += rows.length;
      if (rows.length < BATCH) break;
    }
    stats[t.name] = count;
    // users and profiles reference each other: fill the deferred columns of both once both tables are loaded
    if (t.name === 'profiles') yield `${fixups.splice(0).join('\n')}\n`;
  }
  for (const t of TABLES.filter((x) => x.identity)) {
    yield `SELECT setval(pg_get_serial_sequence('${t.name}', 'id'), GREATEST((SELECT max(id) FROM ${t.name}), 1));\n`;
  }
  yield 'COMMIT;\n';
}

export const backupFileName = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `dataverse-backup_${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}-${p(d.getUTCMinutes())}-${p(d.getUTCSeconds())}_UTC.zip`;
};

function* walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue; // never follow links out of the folder
    const full = path.join(dir, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(full, r); else if (e.isFile()) yield { full, rel: r };
  }
}

/** Candidate folders for image files on disk (the app itself stores photos in the database). */
export const imageDirs = () => [path.join(repoRoot, 'img'), path.join(repoRoot, 'database', 'import', 'img')].filter((d) => fs.existsSync(d) && fs.statSync(d).isDirectory());

/**
 * Builds ONE zip into `out` (an http response or a file stream):
 *   database.sql   restorable data dump
 *   img/...        every profile photo (from the database) plus any files found in an img folder on disk
 *   manifest.json  counts + migrations, README.txt  restore steps
 */
export async function writeBackup(out, { now = new Date() } = {}) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const done = new Promise((resolve, reject) => { archive.on('error', reject); out.on('error', reject); out.on('close', resolve); out.on('finish', resolve); });
  archive.pipe(out);
  const throttle = () => new Promise((r) => archive.once('entry', r));

  const stats = {};
  const sql = Readable.from(dumpSql(stats), { objectMode: false });
  const sqlEntry = throttle();
  archive.append(sql, { name: 'database.sql' });
  await sqlEntry;

  const added = new Set();
  let photos = 0;
  for (let offset = 0; ; offset += 20) {
    const { rows } = await query('SELECT profile_id, content_type, data FROM profile_photos ORDER BY profile_id LIMIT 20 OFFSET $1', [offset]);
    if (!rows.length) break;
    for (const r of rows) {
      const name = `img/profile/profile_${r.profile_id}.${EXT[r.content_type] || 'bin'}`;
      const entry = throttle();
      archive.append(r.data, { name }); added.add(name); photos++;
      await entry;
    }
    if (rows.length < 20) break;
  }
  for (let offset = 0; ; offset += 20) {
    const { rows } = await query('SELECT organization_id, content_type, data FROM organization_photos ORDER BY organization_id LIMIT 20 OFFSET $1', [offset]);
    if (!rows.length) break;
    for (const r of rows) {
      const name = `img/organization/organization_${r.organization_id}.${EXT[r.content_type] || 'bin'}`;
      const entry = throttle();
      archive.append(r.data, { name }); added.add(name); photos++;
      await entry;
    }
    if (rows.length < 20) break;
  }
  let diskFiles = 0;
  for (const dir of imageDirs()) {
    for (const f of walk(dir)) {
      const name = `img/${f.rel}`;
      if (added.has(name)) continue;
      const entry = throttle();
      archive.file(f.full, { name }); added.add(name); diskFiles++;
      await entry;
    }
  }
  const migrations = (await query('SELECT name, applied_at FROM schema_migrations ORDER BY name').catch(() => ({ rows: [] }))).rows;
  const manifest = { app: 'dataverse', createdAt: now.toISOString(), rows: stats, photosFromDatabase: photos, imageFilesFromDisk: diskFiles, migrations: migrations.map((m) => m.name) };
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  archive.append([
    'Dataverse backup', `Created: ${now.toISOString()}`, '',
    'database.sql  All data (users incl. password hashes, profiles, photos, contacts, posts, links, settings, audit log).',
    'img/          Profile photos and organization logos exported as files (the same images are also inside database.sql).', '',
    'RESTORE', '1. Create an empty PostgreSQL database and set DATABASE_URL (do NOT set BOOTSTRAP_ADMIN_* for this step).',
    '2. npm run db:migrate', '3. psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database.sql', '',
    'KEEP THIS FILE PRIVATE: it contains personal data and password hashes.', ''].join('\n'), { name: 'README.txt' });
  await archive.finalize();
  await done;
  return manifest;
}
