// Integration tests - run against a throw-away PostgreSQL database (NEVER your real one; it is wiped).
//   createdb dataverse_test
//   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/dataverse_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://dv:dvpass@localhost:5432/dataverse_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';

const { createApp } = await import('../src/app.js');
const { getPool, closePool, query } = await import('../src/db/pool.js');
const { bootstrapAdmin } = await import('../src/services/bootstrapAdmin.js');

let server; let base;
const migration = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations/001_init.sql'), 'utf8');

/** minimal HTTP client with a per-user cookie jar */
function client() {
  let cookie = '';
  const call = async (method, url, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'dataverse', ...(cookie ? { Cookie: cookie } : {}), ...extra };
    let payload;
    if (Buffer.isBuffer(body)) payload = body; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie?.().find((c) => c.startsWith('dv_session='));
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = res.status === 204 ? null : type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, type };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b), patch: (u, b) => call('PATCH', u, b), put: (u, b, h) => call('PUT', u, b, h), del: (u) => call('DELETE', u), call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}
const PW = 'correct-horse-battery';
let admin; let alice; let bob;

before(async () => {
  const pool = getPool();
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(migration);
  await bootstrapAdmin({ email: 'root@test.dev', username: 'root', password: PW, name: 'Root' });
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
  admin = client(); alice = client(); bob = client();
  assert.equal((await admin.post('/auth/login', { identifier: 'root', password: PW })).status, 200);
  assert.equal((await alice.post('/auth/register', { displayName: 'Alice', username: 'alice', email: 'alice@test.dev', password: PW })).status, 201);
  assert.equal((await bob.post('/auth/register', { displayName: 'Bob', username: 'bob', email: 'bob@test.dev', password: PW })).status, 201);
});
after(async () => { server?.close(); await closePool(); });

test('registration always creates a USER and rejects a smuggled role', async () => {
  const c = client();
  const r = await c.post('/auth/register', { displayName: 'Eve', username: 'eve', email: 'eve@test.dev', password: PW, role: 'ADMIN' });
  assert.equal(r.status, 422);
  const { rows } = await query("SELECT role FROM users WHERE username = 'alice'");
  assert.equal(rows[0].role, 'USER');
});

test('anonymous requests are rejected; CSRF header is required for cookie sessions', async () => {
  assert.equal((await client().get('/profiles')).status, 401);
  const r = await alice.call('POST', '/profiles', { name: 'X' }, { 'X-Requested-With': '' });
  assert.equal(r.status, 403);
});

test('responses never expose password hashes', async () => {
  const me = await alice.get('/auth/me');
  const list = await admin.get('/admin/users');
  const text = JSON.stringify([me.data, list.data]);
  assert.ok(!/password_hash|passwordHash|\$2[aby]\$/.test(text));
});

test('admin API is closed to normal users', async () => {
  for (const p of ['/admin/stats', '/admin/users', '/admin/settings', '/admin/audit-logs', '/admin/system']) assert.equal((await alice.get(p)).status, 403, p);
  assert.equal((await alice.post('/admin/users', { displayName: 'Z', username: 'zzz', email: 'z@z.dev', role: 'ADMIN' })).status, 403);
});

test('profiles: spouse link is symmetric, relatives are searchable, loops are blocked', async () => {
  const dad = (await alice.post('/profiles', { name: 'Karim Uddin', gender: 'MALE', nid: '1234567890', dob: '1960-05-01' })).data.profile;
  const mom = (await alice.post('/profiles', { name: 'Rahima Begum', gender: 'FEMALE', spouseId: dad.id })).data.profile;
  assert.equal((await alice.get(`/profiles/${dad.id}`)).data.profile.spouseId, mom.id, 'dad should point back to mom');
  assert.equal((await alice.get(`/profiles/${dad.id}`)).data.profile.maritalStatus, 'MARRIED');
  const kid = (await alice.post('/profiles', { name: 'Sabbir Karim', gender: 'MALE', fatherId: dad.id, motherId: mom.id })).data.profile;

  const tree = (await alice.get(`/tree/${kid.id}?up=2&down=1`)).data;
  assert.equal(tree.ancestors.father.id, dad.id);
  assert.deepEqual(tree.lineage.map((p) => p.id), [dad.id, kid.id]);
  const dadTree = (await alice.get(`/tree/${dad.id}`)).data;
  assert.equal(dadTree.descendants.children[0].id, kid.id);
  assert.equal(dadTree.descendants.spouse.id, mom.id);

  // a person cannot become their own ancestor
  const loop = await alice.patch(`/profiles/${dad.id}`, { fatherId: kid.id });
  assert.equal(loop.status, 409);
  assert.equal((await alice.patch(`/profiles/${dad.id}`, { fatherId: dad.id })).status, 400);

  // partial + case-insensitive search, ID search, filters
  assert.equal((await alice.get('/profiles?q=KARIM')).data.total, 2);
  assert.equal((await alice.get(`/profiles?q=${dad.id}`)).data.items[0].id, dad.id);
  assert.equal((await alice.get('/profiles?gender=FEMALE')).data.total, 1);

  // removing the spouse clears both sides
  await alice.patch(`/profiles/${mom.id}`, { spouseId: null });
  assert.equal((await alice.get(`/profiles/${dad.id}`)).data.profile.spouseId, null);

  // deleting a profile never deletes relatives
  assert.equal((await alice.del(`/profiles/${kid.id}`)).status, 204);
  assert.equal((await alice.get(`/profiles/${dad.id}`)).status, 200);
});

test('profile permissions: only creator/linked user/admin may edit; NID is hidden from others', async () => {
  const p = (await alice.post('/profiles', { name: 'Private Person', nid: '99887766' })).data.profile;
  assert.equal((await alice.get(`/profiles/${p.id}`)).data.profile.nid, '99887766');
  const asBob = await bob.get(`/profiles/${p.id}`);
  assert.equal(asBob.data.profile.nid, null);
  assert.equal(asBob.data.profile.nidHidden, true);
  assert.equal(asBob.data.profile.permissions.canEdit, false);
  assert.equal((await bob.patch(`/profiles/${p.id}`, { name: 'Hacked' })).status, 403);
  assert.equal((await bob.del(`/profiles/${p.id}`)).status, 403);
  assert.equal((await admin.patch(`/profiles/${p.id}`, { occupation: 'Teacher' })).status, 200);
  assert.equal((await admin.get(`/profiles/${p.id}`)).data.profile.nid, '99887766');
});

test('validation: bad input is rejected with field errors', async () => {
  const r = await alice.post('/profiles', { name: '', email: 'nope', dob: '2999-01-01', bloodGroup: 'Z+' });
  assert.equal(r.status, 422);
  assert.ok(r.data.error.details.name && r.data.error.details.email && r.data.error.details.dob && r.data.error.details.bloodGroup);
  assert.equal((await alice.post('/profiles', { name: 'Ok', unknownField: 1 })).status, 422);
  // SQL-injection style input is just data
  const inj = await alice.get(`/profiles?q=${encodeURIComponent("'; DROP TABLE profiles; --")}`);
  assert.equal(inj.status, 200);
  assert.equal((await query('SELECT count(*)::int AS n FROM profiles')).rows[0].n > 0, true);
});

test('photos: signature is verified, bytes are served back with the right type', async () => {
  const p = (await alice.post('/profiles', { name: 'Photo Person' })).data.profile;
  const fake = await alice.put(`/profiles/${p.id}/photo`, Buffer.from('this is not an image at all, really'), { 'Content-Type': 'image/png' });
  assert.equal(fake.status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const ok = await alice.put(`/profiles/${p.id}/photo`, png, { 'Content-Type': 'image/png' });
  assert.equal(ok.status, 200);
  assert.match(ok.data.profile.photoUrl, /photo\?v=/);
  const got = await bob.get(`/profiles/${p.id}/photo`);
  assert.equal(got.status, 200);
  assert.equal(got.type, 'image/png');
  assert.equal((await bob.put(`/profiles/${p.id}/photo`, png, { 'Content-Type': 'image/png' })).status, 403);
});

test('caller id: formatting, duplicates, partial search, vCard import, ownership', async () => {
  const dad = (await alice.post('/profiles', { name: 'Phone Owner', phone: '01711000111' })).data.profile;
  const c = await alice.post('/contacts', { name: 'রহিম', number: '01711000111', connectionId: dad.id });
  assert.equal(c.status, 201);
  assert.equal(c.data.item.number, '+8801711000111');
  assert.equal(c.data.item.profileId, dad.id, 'auto-linked to the profile that owns this number');
  assert.equal((await alice.post('/contacts', { name: 'রহিম ', number: '+88 01711-000111', connectionId: dad.id })).status, 409, 'duplicate in the same phonebook');
  assert.equal((await alice.post('/contacts', { name: 'রহিম', number: '01711000111' })).status, 201, 'same number in another phonebook is fine');

  assert.equal((await alice.get('/contacts?q=71100')).data.total, 2);
  assert.equal((await alice.get(`/contacts?q=${encodeURIComponent('রহ')}`)).data.total, 2);
  assert.equal((await alice.get(`/contacts?q=rahim`)).data.total, 0);

  const vcf = 'BEGIN:VCARD\nVERSION:3.0\nFN:Jamal Hossain\nTEL;TYPE=CELL:01822-334455\nEND:VCARD\nBEGIN:VCARD\nFN:Jamal Hossain\nTEL:01822334455\nEND:VCARD\nBEGIN:VCARD\nFN:No Phone\nEND:VCARD\n';
  const imp = await alice.post('/contacts/import-vcf', { connectionId: dad.id, vcf });
  assert.equal(imp.status, 201);
  assert.equal(imp.data.inserted, 1);
  assert.equal(imp.data.duplicatesSkipped, 1);

  const id = c.data.item.id;
  assert.equal((await bob.patch(`/contacts/${id}`, { name: 'Mine now' })).status, 403);
  assert.equal((await bob.del(`/contacts/${id}`)).status, 403);
  assert.equal((await alice.patch(`/contacts/${id}`, { name: 'Rahim Updated' })).status, 200);
  assert.equal((await admin.del(`/contacts/${id}`)).status, 204);
});

test('admin: create user (temp password), role change, self-protection, last-admin protection, audit trail', async () => {
  const created = await admin.post('/admin/users', { displayName: 'Carol', username: 'carol', email: 'carol@test.dev', role: 'USER' });
  assert.equal(created.status, 201);
  assert.ok(created.data.temporaryPassword && created.data.temporaryPassword.length >= 12);
  const carol = client();
  assert.equal((await carol.post('/auth/login', { identifier: 'carol', password: created.data.temporaryPassword })).data.user.mustChangePassword, true);

  const me = (await admin.get('/auth/me')).data.user;
  assert.equal((await admin.patch(`/admin/users/${me.id}`, { role: 'USER' })).status, 409, 'cannot demote yourself');
  assert.equal((await admin.patch(`/admin/users/${me.id}`, { isActive: false })).status, 409);
  assert.equal((await admin.del(`/admin/users/${me.id}`)).status, 409, 'cannot delete yourself');

  // promote carol, then the original admin could be demoted by carol - but never the last admin
  assert.equal((await admin.patch(`/admin/users/${created.data.user.id}`, { role: 'ADMIN' })).status, 200);
  const carol2 = client(); await carol2.post('/auth/login', { identifier: 'carol', password: created.data.temporaryPassword });
  assert.equal((await carol2.patch(`/admin/users/${me.id}`, { role: 'USER' })).status, 200);
  assert.equal((await admin.get('/admin/stats')).status, 401, 'demoted admin session is revoked immediately');
  assert.equal((await carol2.patch(`/admin/users/${created.data.user.id}`, { role: 'USER' })).status, 409, 'self-demotion blocked');
  await carol2.patch(`/admin/users/${me.id}`, { role: 'ADMIN' }); // restore
  assert.equal((await admin.post('/auth/login', { identifier: 'root', password: PW })).status, 200);

  const log = (await carol2.get('/admin/audit-logs?limit=50')).data.items.map((i) => i.action);
  for (const a of ['user.create', 'user.role_change']) assert.ok(log.includes(a), `audit has ${a}`);
  assert.ok(!JSON.stringify(log).includes(created.data.temporaryPassword));
});

test('sessions: password change and deactivation invalidate existing sessions immediately', async () => {
  const u = client();
  await u.post('/auth/register', { displayName: 'Dan', username: 'dan', email: 'dan@test.dev', password: PW });
  const stolen = client(); stolen.cookie = u.cookie;
  assert.equal((await stolen.get('/auth/me')).status, 200);
  assert.equal((await u.put('/me/password', { currentPassword: 'wrong-password-123', newPassword: 'another-long-password' })).status, 400);
  assert.equal((await u.put('/me/password', { currentPassword: PW, newPassword: 'another-long-password' })).status, 200);
  assert.equal((await u.get('/auth/me')).status, 200, 'the session that changed the password stays signed in');
  assert.equal((await stolen.get('/auth/me')).status, 401, 'old token is dead');

  const id = (await u.get('/auth/me')).data.user.id;
  await admin.patch(`/admin/users/${id}`, { isActive: false });
  assert.equal((await u.get('/auth/me')).status, 401);
  assert.equal((await client().post('/auth/login', { identifier: 'dan', password: 'another-long-password' })).status, 403);
});

test('site settings: registration toggle is enforced by the API and audited', async () => {
  assert.equal((await admin.put('/admin/settings', { registration_enabled: false, site_name: 'Test Verse' })).status, 200);
  assert.equal((await client().get('/settings/public')).data.settings.siteName, 'Test Verse');
  assert.equal((await client().post('/auth/register', { displayName: 'Late', username: 'late', email: 'late@test.dev', password: PW })).status, 403);
  assert.equal((await alice.put('/admin/settings', { registration_enabled: true })).status, 403);
  await admin.put('/admin/settings', { registration_enabled: true });
  assert.ok((await admin.get('/admin/audit-logs?action=settings.update')).data.total >= 2);
});

test('password reset flow: token is single-use and invalidates old sessions', async () => {
  const log = console.log; let mail = '';
  console.log = (...a) => { mail += a.join(' '); };
  const r = await client().post('/auth/forgot-password', { email: 'bob@test.dev' });
  const unknown = await client().post('/auth/forgot-password', { email: 'nobody@test.dev' });
  console.log = log;
  assert.equal(r.status, 200); assert.deepEqual(r.data, unknown.data, 'same answer for unknown accounts');
  const token = mail.match(/token=([a-f0-9]{64})/)?.[1];
  assert.ok(token, 'a reset link was produced');
  assert.equal((await client().post('/auth/reset-password', { token, password: 'brand-new-password-1' })).status, 200);
  assert.equal((await client().post('/auth/reset-password', { token, password: 'brand-new-password-2' })).status, 400, 'token cannot be reused');
  assert.equal((await bob.get('/auth/me')).status, 401, 'old session invalidated');
  assert.equal((await client().post('/auth/login', { identifier: 'bob', password: 'brand-new-password-1' })).status, 200);
});

test('rate limiting: repeated failed logins are throttled', async () => {
  const c = client(); let last;
  for (let i = 0; i < 10; i++) last = await c.post('/auth/login', { identifier: 'ratelimited-user', password: 'nope-nope-nope' });
  assert.equal(last.status, 429);
});
