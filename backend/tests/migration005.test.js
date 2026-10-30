// Migration 005 on a database in the 004 shape: rename Profiles -> Peoples, reshape social links, lower-case tags. Nothing may be lost.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://dv:dvpass@localhost:5432/dataverse_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.NODE_ENV = 'test';
const { getPool, closePool, query } = await import('../src/db/pool.js');
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const f005 = files.find((f) => f.startsWith('005'));

before(async () => {
  await getPool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await getPool().query(files.filter((f) => f < '005').map(read).join('\n'));
  await getPool().query(`
    INSERT INTO users (id, email, username, display_name, password_hash, role) VALUES ('11111111-1111-1111-1111-111111111111','a@a.dev','admin','Admin','x','ADMIN');
    INSERT INTO profiles (id, name, gender, tags, social_links, nid) OVERRIDING SYSTEM VALUE VALUES
      (1,'Rahim','MALE','{BD,"#News",bd}','{"facebook":["fb.com/rahim","https://facebook.com/r2"],"instagram":["@rahim_ig"],"tiktok":["rahim.tt"]}','1234'),
      (2,'Karima','FEMALE','{}','{}',NULL), (3,'Odd','MALE','{" ",x}','{"facebook":["  "],"instagram":["my page!"]}',NULL);
    INSERT INTO organizations (id, name, org_type, tags, social_links) OVERRIDING SYSTEM VALUE VALUES (10,'Party','POLITICAL_PARTY','{Politics}','{"facebook":["party.page"]}');
    UPDATE profiles SET father_id = 1 WHERE id = 3;
    INSERT INTO marriages (person_a, person_b) VALUES (1, 2);
    INSERT INTO memberships (human_id, organization_id, role) VALUES (1, 10, 'President');
    INSERT INTO profile_photos (profile_id, content_type, data, size_bytes) VALUES (1, 'image/png', '\\x89504e470d0a1a0a00000000', 12);
    INSERT INTO posts (profile_id, title, content) VALUES (1, 'Hello', 'x');
    INSERT INTO caller_contacts (name, number, profile_id, connection_id) VALUES ('Rahim phone', '01711000001', 1, 2);
    UPDATE users SET profile_id = 1 WHERE username = 'admin';
    INSERT INTO audit_logs (action, entity_type, entity_id, summary) VALUES ('profile.create', 'profile', '1', 'x'), ('profile.update', 'profile', '1', 'y'), ('user.create', 'user', 'z', 'z');
  `);
  await getPool().query("SELECT setval(pg_get_serial_sequence('profiles', 'id'), 3)"); // as in a real database: the sequence is ahead of the data
  await getPool().query(read(f005));
});
after(async () => { await closePool(); });
const one = async (sql, p) => (await query(sql, p)).rows[0];

test('tables, columns, indexes and constraints are renamed; ids, data and relationships are untouched', async () => {
  const tables = (await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map((r) => r.table_name);
  assert.ok(tables.includes('peoples') && tables.includes('people_photos') && tables.includes('favicons'));
  assert.ok(!tables.includes('profiles') && !tables.includes('profile_photos'));
  const cols = (await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND (column_name LIKE '%profile%' OR column_name = 'human_id')")).rows;
  assert.deepEqual(cols, [], 'no profile / human columns remain');
  const names = (await query("SELECT indexname AS n FROM pg_indexes WHERE schemaname = 'public' UNION SELECT conname FROM pg_constraint UNION SELECT relname FROM pg_class WHERE relkind = 'S'")).rows.map((r) => r.n);
  assert.deepEqual(names.filter((n) => /profile|human/.test(n)), [], 'indexes, constraints and sequences are renamed too');
  assert.ok(names.includes('peoples_pkey') && names.includes('peoples_death_after_birth'));
  assert.deepEqual((await query('SELECT id, name FROM peoples ORDER BY id')).rows.map((r) => r.name), ['Rahim', 'Karima', 'Odd']);
  assert.equal((await one('SELECT nid FROM peoples WHERE id = 1')).nid, '1234');
  assert.equal((await one('SELECT father_id FROM peoples WHERE id = 3')).father_id, 1);
  assert.equal((await one('SELECT count(*)::int AS n FROM marriages')).n, 1);
  assert.deepEqual((await one('SELECT people_id, role FROM memberships')), { people_id: 1, role: 'President' });
  assert.equal((await one('SELECT count(*)::int AS n FROM people_photos WHERE people_id = 1')).n, 1);
  assert.equal((await one('SELECT people_id FROM posts')).people_id, 1);
  assert.deepEqual((await one('SELECT people_id, connection_id FROM caller_contacts')), { people_id: 1, connection_id: 2 });
  assert.equal((await one("SELECT people_id FROM users WHERE username = 'admin'")).people_id, 1);
  const id = (await one("INSERT INTO peoples (name) VALUES ('New') RETURNING id")).id;
  assert.equal(id, 4);
  assert.equal((await one("SELECT pg_get_serial_sequence('peoples', 'id') AS s")).s, 'public.peoples_id_seq', 'the identity sequence was renamed with the table');
  await assert.rejects(query("INSERT INTO peoples (name, dob, date_of_death) VALUES ('X', '2000-01-01', '1999-01-01')"), /peoples_death_after_birth/);
});

test('social links become one flat list of URLs (handles become profile links), nothing dropped', async () => {
  const links = (await one('SELECT social_links FROM peoples WHERE id = 1')).social_links;
  assert.equal(links.length, 4);
  assert.ok(links.includes('https://facebook.com/r2'), 'full URLs are kept as they were');
  assert.ok(links.includes('https://instagram.com/rahim_ig'), 'the @ is dropped from handles');
  assert.ok(links.includes('https://tiktok.com/@rahim.tt'));
  assert.ok(links.every((u) => /^https:\/\//.test(u)));
  assert.deepEqual((await one('SELECT social_links FROM peoples WHERE id = 2')).social_links, []);
  assert.deepEqual((await one('SELECT social_links FROM peoples WHERE id = 3')).social_links, ['https://instagram.com/mypage'], 'blank entries dropped, odd characters cleaned');
  assert.deepEqual((await one('SELECT social_links FROM organizations WHERE id = 10')).social_links, ['https://facebook.com/party.page']);
  await assert.rejects(query(`UPDATE peoples SET social_links = '{"facebook":[]}' WHERE id = 2`), /social_links_array/, 'the old object shape is now impossible');
});

test('tags are lower-cased and de-duplicated; settings, favicon cache and audit wording are in place', async () => {
  assert.deepEqual((await one('SELECT tags FROM peoples WHERE id = 1')).tags.sort(), ['bd', 'news']);
  assert.deepEqual((await one('SELECT tags FROM peoples WHERE id = 3')).tags, ['x']);
  assert.deepEqual((await one('SELECT tags FROM organizations WHERE id = 10')).tags, ['politics']);
  assert.deepEqual((await one("SELECT value FROM site_settings WHERE key = 'card_fields'")).value, { people: ['nickname', 'occupation', 'district'], organization: ['district', 'foundedOn'] });
  assert.deepEqual((await query('SELECT action, entity_type FROM audit_logs ORDER BY id')).rows, [
    { action: 'people.create', entity_type: 'people' }, { action: 'people.update', entity_type: 'people' }, { action: 'user.create', entity_type: 'user' }]);
  await query("INSERT INTO favicons (domain, found) VALUES ('example.com', false)");
});
