// Migration 004 on a database that already holds data in the 003 shape: nothing may be lost.
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
const upTo = (n) => files.filter((f) => f < n).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const sql004 = fs.readFileSync(path.join(dir, files.find((f) => f.startsWith('004'))), 'utf8');

before(async () => {
  await getPool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await getPool().query(upTo('004'));
  await getPool().query(`
    INSERT INTO users (id, email, username, display_name, password_hash, role) VALUES ('11111111-1111-1111-1111-111111111111','a@a.dev','admin','Admin','x','ADMIN');
    INSERT INTO profiles (id, name, gender, entity_type, nid, occupation, dob) OVERRIDING SYSTEM VALUE VALUES
      (1,'Human A','MALE','HUMAN','123','Teacher','1980-01-01'), (2,'Human B','FEMALE','HUMAN',NULL,NULL,NULL), (3,'Human C','MALE','HUMAN',NULL,NULL,NULL);
    INSERT INTO profiles (id, name, nickname, entity_type, dob, date_of_death, district, present_city, email, phone, about, tags, social_links, created_by, photo_updated_at)
      OVERRIDING SYSTEM VALUE VALUES
      (10,'Test Party','TP','POLITICAL_PARTY','1978-01-01',NULL,'Dhaka','Dhaka','p@p.dev','01711000222','About the party','{politics,bd}','{"facebook":["fb.com/tp"]}','11111111-1111-1111-1111-111111111111', now()),
      (11,'Youth Wing',NULL,'GROUP',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','{}',NULL,NULL),
      (12,'Big Family',NULL,'FAMILY',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','{}',NULL,NULL),
      (13,'Acme Ltd',NULL,'ORGANIZATION',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','{}',NULL,NULL),
      (14,'Odd Thing',NULL,'OTHER',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','{}',NULL,NULL);
    UPDATE profiles SET father_id = 1 WHERE id = 3;
    INSERT INTO marriages (person_a, person_b, married_on) VALUES (1, 2, '2000-01-01');
    UPDATE profiles SET spouse_id = 2 WHERE id = 1; UPDATE profiles SET spouse_id = 1 WHERE id = 2;
    INSERT INTO entity_links (from_id, to_id, link_type, role, started_on) VALUES
      (1, 10, 'MEMBER_OF', 'President', '2010-01-01'),
      (3, 11, 'MEMBER_OF', NULL, NULL),
      (2, 10, 'AFFILIATED_WITH', NULL, NULL),
      (10, 3, 'CONNECTED_TO', 'advisor', NULL),   -- reverse direction: organization -> human
      (11, 10, 'SUB_UNIT_OF', NULL, NULL),
      (12, 10, 'MEMBER_OF', NULL, NULL),          -- organization member of an organization
      (13, 10, 'AFFILIATED_WITH', NULL, NULL),
      (1, 3, 'CONNECTED_TO', NULL, NULL);         -- human <-> human: cannot be mapped, must not be lost
    INSERT INTO profile_photos (profile_id, content_type, data, size_bytes) VALUES (10, 'image/png', '\\x89504e470d0a1a0a00000000', 12), (1, 'image/png', '\\x89504e470d0a1a0a00000001', 12);
    INSERT INTO posts (profile_id, title, content, created_by) VALUES (10, 'Party news', 'hello', '11111111-1111-1111-1111-111111111111'), (1, 'About A', 'x', NULL);
    INSERT INTO caller_contacts (name, number, connection_id, profile_id) VALUES ('Party office', '+8801711000222', 1, 10), ('Plain', '01711000333', 1, NULL), ('Org book', '01711000444', 13, NULL);
    INSERT INTO users (id, email, username, display_name, password_hash, role, profile_id) VALUES ('22222222-2222-2222-2222-222222222222','u@a.dev','linked','Linked','x','USER', 2);
  `);
  await getPool().query(sql004);
});
after(async () => { await closePool(); });

const one = async (sql, p) => (await query(sql, p)).rows[0];

test('humans stay in profiles with the same ids, relationships and data', async () => {
  assert.deepEqual((await query('SELECT id FROM profiles ORDER BY id')).rows.map((r) => r.id), [1, 2, 3]);
  const a = await one('SELECT * FROM profiles WHERE id = 1');
  assert.equal(a.nid, '123'); assert.equal(a.occupation, 'Teacher'); assert.equal(a.spouse_id, 2);
  assert.equal((await one('SELECT father_id FROM profiles WHERE id = 3')).father_id, 1);
  assert.equal((await one('SELECT count(*)::int AS n FROM marriages')).n, 1);
  assert.equal((await one("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'entity_type'")).n, 0);
  assert.equal((await one("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'website'")).n, 1);
  assert.equal((await one("SELECT profile_id FROM users WHERE username = 'linked'")).profile_id, 2);
  assert.equal((await one('SELECT count(*)::int AS n FROM profile_photos')).n, 1, 'human photo kept, organization photo moved');
});

test('political parties, groups, organizations and families become organizations with their ids and data', async () => {
  const rows = (await query('SELECT id, org_type FROM organizations ORDER BY id')).rows;
  assert.deepEqual(rows.map((r) => [r.id, r.org_type]), [[10, 'POLITICAL_PARTY'], [11, 'GROUP'], [12, 'GROUP'], [13, 'ORGANIZATION'], [14, 'OTHER']]);
  const p = await one('SELECT * FROM organizations WHERE id = 10');
  assert.equal(p.name, 'Test Party'); assert.equal(p.short_name, 'TP'); assert.equal(p.founded_on, '1978-01-01');
  assert.equal(p.district, 'Dhaka'); assert.equal(p.present_city, 'Dhaka'); assert.equal(p.email, 'p@p.dev');
  assert.equal(p.phone_digits, '01711000222'); assert.deepEqual(p.tags, ['politics', 'bd']);
  assert.deepEqual(p.social_links, { facebook: ['fb.com/tp'] });
  assert.equal(p.created_by, '11111111-1111-1111-1111-111111111111');
  assert.equal((await one('SELECT count(*)::int AS n FROM organization_photos WHERE organization_id = 10')).n, 1);
  assert.ok(p.photo_updated_at);
});

test('every human-organization connection is preserved as a membership (either direction)', async () => {
  const m = (await query('SELECT human_id, organization_id, relation, role FROM memberships ORDER BY human_id, organization_id, relation')).rows;
  assert.deepEqual(m.map((r) => [r.human_id, r.organization_id, r.relation, r.role]), [
    [1, 10, 'MEMBER', 'President'], [2, 10, 'AFFILIATED', null], [3, 10, 'CONNECTED', 'advisor'], [3, 11, 'MEMBER', null]]);
  assert.equal((await one("SELECT started_on FROM memberships WHERE human_id = 1")).started_on, '2010-01-01');
});

test('organization-to-organization links are preserved; unmappable links are kept, not dropped', async () => {
  const l = (await query('SELECT from_id, to_id, link_type FROM organization_links ORDER BY from_id')).rows;
  assert.deepEqual(l.map((r) => [r.from_id, r.to_id, r.link_type]), [[11, 10, 'SUB_UNIT_OF'], [12, 10, 'MEMBER_OF'], [13, 10, 'AFFILIATED_WITH']]);
  const un = (await query('SELECT from_id, to_id FROM entity_links_unmapped')).rows;
  assert.deepEqual(un.map((r) => [r.from_id, r.to_id]), [[1, 3]]);
  assert.equal((await one("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'entity_links'")).n, 0);
});

test('posts and contact numbers follow their subject; nothing is orphaned', async () => {
  const posts = (await query('SELECT title, profile_id, organization_id FROM posts ORDER BY id')).rows;
  assert.deepEqual(posts, [{ title: 'Party news', profile_id: null, organization_id: 10 }, { title: 'About A', profile_id: 1, organization_id: null }]);
  const c = (await query('SELECT name, connection_id, profile_id, organization_id FROM caller_contacts ORDER BY id')).rows;
  assert.deepEqual(c, [
    { name: 'Party office', connection_id: 1, profile_id: null, organization_id: 10 },
    { name: 'Plain', connection_id: 1, profile_id: null, organization_id: null },
    { name: 'Org book', connection_id: null, profile_id: null, organization_id: null }]);
});

test('new tables work: sequences continue, constraints hold, setting exists', async () => {
  const id = (await one("INSERT INTO organizations (name, org_type) VALUES ('New Co', 'COMPANY') RETURNING id")).id;
  assert.ok(id > 14);
  await assert.rejects(query("INSERT INTO organizations (name, org_type) VALUES ('Bad', 'FAMILY')"));
  await assert.rejects(query("INSERT INTO posts (title) VALUES ('no subject')"));
  assert.equal((await one("SELECT value FROM site_settings WHERE key = 'blur_female_photos'")).value, false);
});
