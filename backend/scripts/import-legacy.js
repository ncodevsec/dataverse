#!/usr/bin/env node
/**
 * Imports the legacy PHP/MySQL Dataverse data into PostgreSQL.
 *
 *   npm run db:import -- --file database/import/dataverse_db_21-06-2026.sql [--photos database/import/img/profile] [--truncate] [--dry-run]
 *
 * - Reads the mysqldump .sql file directly (no MySQL server needed).
 * - Preserves the original profile / contact / post IDs, so legacy "Dataverse IDs" and relationships keep working.
 * - Normalises: tinyint flags -> readable values, 0 -> NULL for missing relatives, 0000-00-00 -> NULL, JSON lineage/tags -> text/array,
 *   BD phone numbers -> +8801XXXXXXXXX, one-way spouse links -> symmetric, duplicate contacts -> dropped (unique index).
 * - Runs in ONE transaction: either everything is imported or nothing is.
 * - Refuses to run on a non-empty profiles table unless --truncate is given (so you cannot import twice by accident).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, withTransaction } from '../src/db/pool.js';
import { parseDump } from './lib/mysqlDump.js';
import { formatPhone } from '../src/utils/phone.js';
import { sniffImageType } from '../src/services/profileService.js';
import { BLOOD_GROUPS } from '../src/utils/schemas.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : undefined; };

const importDir = path.join(repoRoot, 'database/import');
let file = opt('file');
if (!file) {
  const found = fs.existsSync(importDir) ? fs.readdirSync(importDir).filter((f) => f.endsWith('.sql')).sort().pop() : null;
  if (found) file = path.join(importDir, found);
}
if (!file || !fs.existsSync(file)) {
  console.error('No SQL dump found. Pass --file <dump.sql> or place it in database/import/.');
  process.exit(1);
}
let photosDir = opt('photos') || path.join(importDir, 'img/profile');

// ------------------------------------------------------------------ helpers
const text = (v) => { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s; };
const int = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
const today = new Date().toISOString().slice(0, 10);
const warnings = [];
const warn = (m) => warnings.push(m);

function date(v, id) {
  const s = text(v);
  if (!s || s.startsWith('0000')) return null;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.endsWith('-00') && s.slice(5, 7) !== '00'
    && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) && s >= '1800-01-01' && s <= today;
  if (!ok) { warn(`profile ${id}: unusable date of birth "${s}" ignored`); return null; }
  return s;
}

function listFrom(v) {
  const s = text(v);
  if (!s) return [];
  let items;
  if (s.startsWith('[')) { try { items = JSON.parse(s); } catch { items = s.split(','); } } else items = s.split(/[,،]/);
  return [...new Set(items.map((t) => String(t).trim()).filter(Boolean))].slice(0, 30);
}

function lineageFrom(v) {
  const s = text(v);
  if (!s) return null;
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s).map((x) => String(x ?? '').trim()).filter(Boolean);
      return arr.length ? [...new Set(arr)].join(' / ') : null; // legacy stored [english, bangla]
    } catch { /* fall through */ }
  }
  return s;
}

async function bulkInsert(client, table, columns, rows, { overriding = false, conflict = '', batch = 400 } = {}) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params = [];
    const tuples = chunk.map((row) => `(${row.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`);
    const res = await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) ${overriding ? 'OVERRIDING SYSTEM VALUE ' : ''}VALUES ${tuples.join(',')} ${conflict}`, params);
    inserted += res.rowCount;
  }
  return inserted;
}

// ------------------------------------------------------------------ main
const report = {};
const dry = flag('dry-run');

console.log(`Reading ${path.relative(process.cwd(), file)} ...`);
const dump = parseDump(fs.readFileSync(file, 'utf8'));
const legacyProfiles = dump.main?.rows ?? [];
const legacyContacts = dump.caller_id?.rows ?? [];
const legacyPosts = dump.posts?.rows ?? [];
console.log(`Found ${legacyProfiles.length} profiles, ${legacyContacts.length} contacts, ${legacyPosts.length} posts.`);
if (!legacyProfiles.length) { console.error('No `main` rows found - is this the right dump?'); process.exit(1); }

const ids = new Set(legacyProfiles.map((r) => Number(r.id)));

try {
  await withTransaction(async (client) => {
    const existing = (await client.query('SELECT count(*)::int AS n FROM profiles')).rows[0].n;
    if (existing && !flag('truncate')) throw new Error(`profiles already contains ${existing} rows. Re-run with --truncate to replace the data (user accounts are kept).`);
    if (flag('truncate')) {
      await client.query('TRUNCATE profile_photos, posts, caller_contacts, profiles RESTART IDENTITY CASCADE');
      console.log('Existing profile/contact/post data truncated.');
    }

    // ---------- profiles (relationships are applied in a second pass so insertion order never matters)
    const cols = ['id', 'name', 'nickname', 'email', 'phone', 'gender', 'marital_status', 'dob', 'blood_group', 'religion', 'political_view',
      'nid', 'occupation', 'education_level', 'education_group', 'lineage', 'present_street', 'present_city', 'street', 'union_name',
      'sub_district', 'district', 'state', 'zip', 'country', 'facebook', 'instagram', 'tiktok', 'about', 'tags'];
    const rows = legacyProfiles.map((r) => {
      const id = Number(r.id);
      const email = text(r.email)?.toLowerCase();
      const blood = text(r.bloodGroup)?.toUpperCase().replace(/\s/g, '');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warn(`profile ${id}: invalid email "${email}" ignored`);
      return [
        id, text(r.name) ?? `Unnamed ${id}`, text(r.nickName),
        email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
        text(r.phoneNumber) ? formatPhone(r.phoneNumber) : null,
        r.gender === '1' ? 'MALE' : 'FEMALE',          // legacy: 1 = male, 0 = female
        r.maritalStatus === '1' ? 'MARRIED' : 'SINGLE', // legacy: 1 = married, 0 = unmarried
        date(r.dob, id), BLOOD_GROUPS.includes(blood) ? blood : null,
        text(r.religion), text(r.politicalView), text(r.nid), text(r.occupation), text(r.eduLevel), text(r.eduGroup),
        lineageFrom(r.lineage), text(r.presentStreet), text(r.presentCity), text(r.street), text(r._union), text(r.subDistrict),
        text(r.district), text(r.state), r.zip && r.zip !== '0' ? String(r.zip) : null, text(r.country),
        text(r.fb), text(r.insta), text(r.tiktok), text(r.about), listFrom(r.tags),
      ];
    });
    report.profiles = await bulkInsert(client, 'profiles', cols, rows, { overriding: true });

    // ---------- relationships (0 / dangling => NULL, spouse links made symmetric)
    const byId = new Map(legacyProfiles.map((r) => [Number(r.id), r]));
    const valid = (v, self) => { const n = int(v); return n && n !== self && ids.has(n) ? n : null; };
    const spouse = new Map();
    for (const r of legacyProfiles) {
      const id = Number(r.id);
      const s = valid(r.spouseID, id);
      if (int(r.spouseID) && !s) warn(`profile ${id}: spouse ${r.spouseID} does not exist, link dropped`);
      spouse.set(id, s);
    }
    let symmetrised = 0;
    for (const [id, s] of spouse) {
      if (!s) continue;
      const back = spouse.get(s);
      if (back === id) continue;
      if (back == null) { spouse.set(s, id); symmetrised++; } else { warn(`profile ${id}: spouse ${s} is married to ${back}; one-way link dropped`); spouse.set(id, null); }
    }
    report.spouseLinksMadeSymmetric = symmetrised;
    const relIds = [], fathers = [], mothers = [], spouses = [];
    for (const id of ids) {
      const r = byId.get(id);
      relIds.push(id); fathers.push(valid(r.fathersID, id)); mothers.push(valid(r.mothersID, id)); spouses.push(spouse.get(id) ?? null);
    }
    await client.query(
      `UPDATE profiles p SET father_id = v.f, mother_id = v.m, spouse_id = v.s,
              marital_status = CASE WHEN v.s IS NOT NULL AND p.marital_status = 'SINGLE' THEN 'MARRIED' ELSE p.marital_status END
         FROM unnest($1::int[], $2::int[], $3::int[], $4::int[]) AS v(id, f, m, s) WHERE p.id = v.id`,
      [relIds, fathers, mothers, spouses]);
    await client.query(`SELECT setval(pg_get_serial_sequence('profiles', 'id'), (SELECT max(id) FROM profiles))`);

    // ---------- caller contacts
    const contactRows = [];
    let skippedEmpty = 0;
    for (const r of legacyContacts) {
      const name = text(r.name);
      const number = text(r.number) ? formatPhone(r.number) : null;
      if (!name || !number) { skippedEmpty++; continue; }
      const conn = int(r.connectionID);
      const prof = int(r.profileID);
      contactRows.push([Number(r.id), name, number, conn && ids.has(conn) ? conn : null, prof && ids.has(prof) ? prof : null]);
    }
    report.contactsInserted = await bulkInsert(client, 'caller_contacts', ['id', 'name', 'number', 'connection_id', 'profile_id'], contactRows,
      { overriding: true, conflict: 'ON CONFLICT DO NOTHING', batch: 1000 });
    report.contactsDuplicatesDropped = contactRows.length - report.contactsInserted;
    report.contactsSkippedEmpty = skippedEmpty;
    await client.query(`SELECT setval(pg_get_serial_sequence('caller_contacts', 'id'), GREATEST((SELECT max(id) FROM caller_contacts), 1))`);

    // ---------- posts
    const postRows = legacyPosts.filter((r) => ids.has(Number(r.profile_id))).map((r) => [
      Number(r.id), Number(r.profile_id), text(r.title) ?? '(untitled)', r.content ?? '',
      ['published', 'draft', 'archived'].includes(r.status) ? r.status : 'published', listFrom(r.tags),
      r.created_at ? new Date(`${r.created_at.replace(' ', 'T')}Z`) : new Date(), r.updated_at ? new Date(`${r.updated_at.replace(' ', 'T')}Z`) : new Date(),
    ]);
    report.posts = postRows.length
      ? await bulkInsert(client, 'posts', ['id', 'profile_id', 'title', 'content', 'status', 'tags', 'created_at', 'updated_at'], postRows, { overriding: true }) : 0;
    report.postsSkippedNoProfile = legacyPosts.length - postRows.length;
    await client.query(`SELECT setval(pg_get_serial_sequence('posts', 'id'), GREATEST((SELECT max(id) FROM posts), 1))`);

    // ---------- photos (img/profile/profile_<id>.jpeg)
    report.photos = 0;
    if (fs.existsSync(photosDir)) {
      for (const f of fs.readdirSync(photosDir)) {
        const m = f.match(/^profile_(\d+)\.(jpe?g|png|webp)$/i);
        if (!m || !ids.has(Number(m[1]))) continue; // skips profile_demo.jpeg and orphans
        const buf = fs.readFileSync(path.join(photosDir, f));
        const type = sniffImageType(buf);
        if (!type || buf.length > 1_000_000) { warn(`photo ${f}: ${type ? 'larger than 1 MB' : 'not a valid image'}, skipped`); continue; }
        await client.query(
          `INSERT INTO profile_photos (profile_id, content_type, data, size_bytes) VALUES ($1,$2,$3,$4)`, [Number(m[1]), type, buf, buf.length]);
        await client.query('UPDATE profiles SET photo_updated_at = now() WHERE id = $1', [Number(m[1])]);
        report.photos++;
      }
    } else {
      console.log(`(no photo folder at ${path.relative(process.cwd(), photosDir)} - photos skipped; use --photos <dir>)`);
    }

    // auto-link contacts to profiles by phone where the legacy data had no link
    const linked = await client.query(
      `UPDATE caller_contacts c SET profile_id = m.id
         FROM (SELECT right(phone_digits, 10) AS k, min(id) AS id, count(*) AS n FROM profiles WHERE length(phone_digits) >= 10 GROUP BY 1) m
        WHERE c.profile_id IS NULL AND length(c.number_digits) >= 10 AND right(c.number_digits, 10) = m.k AND m.n = 1`);
    report.contactsAutoLinkedByPhone = linked.rowCount;

    if (dry) throw Object.assign(new Error('dry-run'), { dry: true });
  });
  console.log(`\n✓ Import complete`);
} catch (err) {
  if (err.dry) console.log('\n✓ Dry run finished - nothing was written');
  else { console.error(`\n✗ Import failed, nothing was written: ${err.message}`); process.exitCode = 1; }
} finally {
  console.table(report);
  if (warnings.length) { console.log(`${warnings.length} warning(s):`); warnings.slice(0, 25).forEach((w) => console.log(`  - ${w}`)); if (warnings.length > 25) console.log(`  ... and ${warnings.length - 25} more`); }
  await closePool();
}
