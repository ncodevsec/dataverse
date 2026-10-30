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
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const migration = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

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
  return { get: (u, h) => call('GET', u, undefined, h), post: (u, b, h) => call('POST', u, b, h), patch: (u, b, h) => call('PATCH', u, b, h), put: (u, b, h) => call('PUT', u, b, h), del: (u, h) => call('DELETE', u, undefined, h), call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}
const PW = 'correct-horse-battery';
/** Step-up authentication header: the acting administrator's own password, base64 encoded. */
const reauth = (pw = PW) => ({ 'X-Confirm-Password': Buffer.from(pw, 'utf8').toString('base64') });
const RE = reauth();
let admin; let alice; let bob;
/** Sign-ups start PENDING; this approves one through the real admin endpoint. */
async function approve(username) {
  const { rows } = await query('SELECT id FROM users WHERE username = $1', [username]);
  const r = await admin.post(`/admin/users/${rows[0].id}/approve`);
  assert.equal(r.status, 200);
}

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
  await approve('alice'); await approve('bob');
  assert.equal((await alice.post('/auth/login', { identifier: 'alice', password: PW })).status, 200);
  assert.equal((await bob.post('/auth/login', { identifier: 'bob', password: PW })).status, 200);
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
  assert.equal((await client().get('/peoples')).status, 401);
  const r = await alice.call('POST', '/peoples', { name: 'X' }, { 'X-Requested-With': '' });
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

test('peoples: spouse link is symmetric, relatives are searchable, loops are blocked', async () => {
  const dad = (await alice.post('/peoples', { name: 'Karim Uddin', gender: 'MALE', nid: '1234567890', dob: '1960-05-01' })).data.people;
  const mom = (await alice.post('/peoples', { name: 'Rahima Begum', gender: 'FEMALE', spouses: [{ personId: dad.id }] })).data.people;
  assert.equal((await alice.get(`/peoples/${dad.id}`)).data.people.spouseId, mom.id, 'dad should point back to mom');
  assert.equal((await alice.get(`/peoples/${dad.id}`)).data.people.maritalStatus, 'MARRIED');
  const kid = (await alice.post('/peoples', { name: 'Sabbir Karim', gender: 'MALE', fatherId: dad.id, motherId: mom.id })).data.people;

  const tree = (await alice.get(`/tree/${kid.id}?up=2&down=1`)).data;
  assert.equal(tree.ancestors.father.id, dad.id);
  assert.deepEqual(tree.lineage.map((p) => p.id), [dad.id, kid.id]);
  const dadTree = (await alice.get(`/tree/${dad.id}`)).data;
  assert.equal(dadTree.descendants.children[0].id, kid.id);
  assert.equal(dadTree.descendants.spouse.id, mom.id);

  // a person cannot become their own ancestor
  const loop = await alice.patch(`/peoples/${dad.id}`, { fatherId: kid.id });
  assert.equal(loop.status, 409);
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { fatherId: dad.id })).status, 400);

  // partial + case-insensitive search, ID search, filters
  assert.equal((await alice.get('/peoples?q=KARIM')).data.total, 2);
  assert.equal((await alice.get(`/peoples?q=${dad.id}`)).data.items[0].id, dad.id);
  assert.equal((await alice.get('/peoples?gender=FEMALE')).data.total, 1);

  // removing the spouse clears both sides
  await alice.patch(`/peoples/${mom.id}`, { spouses: [] });
  assert.equal((await alice.get(`/peoples/${dad.id}`)).data.people.spouseId, null);

  // deleting a people never deletes relatives
  assert.equal((await alice.del(`/peoples/${kid.id}`)).status, 204);
  assert.equal((await alice.get(`/peoples/${dad.id}`)).status, 200);
});

test('people permissions: only creator/linked user/admin may edit; NID is hidden from others', async () => {
  const p = (await alice.post('/peoples', { name: 'Private Person', nid: '99887766' })).data.people;
  assert.equal((await alice.get(`/peoples/${p.id}`)).data.people.nid, '99887766');
  const asBob = await bob.get(`/peoples/${p.id}`);
  assert.equal(asBob.data.people.nid, null);
  assert.equal(asBob.data.people.nidHidden, true);
  assert.equal(asBob.data.people.permissions.canEdit, false);
  assert.equal((await bob.patch(`/peoples/${p.id}`, { name: 'Hacked' })).status, 403);
  assert.equal((await bob.del(`/peoples/${p.id}`)).status, 403);
  assert.equal((await admin.patch(`/peoples/${p.id}`, { occupation: 'Teacher' })).status, 200);
  assert.equal((await admin.get(`/peoples/${p.id}`)).data.people.nid, '99887766');
});

test('validation: bad input is rejected with field errors', async () => {
  const r = await alice.post('/peoples', { name: '', email: 'nope', dob: '2999-01-01', bloodGroup: 'Z+' });
  assert.equal(r.status, 422);
  assert.ok(r.data.error.details.name && r.data.error.details.email && r.data.error.details.dob && r.data.error.details.bloodGroup);
  assert.equal((await alice.post('/peoples', { name: 'Ok', unknownField: 1 })).status, 422);
  // SQL-injection style input is just data
  const inj = await alice.get(`/peoples?q=${encodeURIComponent("'; DROP TABLE peoples; --")}`);
  assert.equal(inj.status, 200);
  assert.equal((await query('SELECT count(*)::int AS n FROM peoples')).rows[0].n > 0, true);
});

test('photos: signature is verified, bytes are served back with the right type', async () => {
  const p = (await alice.post('/peoples', { name: 'Photo Person' })).data.people;
  const fake = await alice.put(`/peoples/${p.id}/photo`, Buffer.from('this is not an image at all, really'), { 'Content-Type': 'image/png' });
  assert.equal(fake.status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const ok = await alice.put(`/peoples/${p.id}/photo`, png, { 'Content-Type': 'image/png' });
  assert.equal(ok.status, 200);
  assert.match(ok.data.people.photoUrl, /photo\?v=/);
  const got = await bob.get(`/peoples/${p.id}/photo`);
  assert.equal(got.status, 200);
  assert.equal(got.type, 'image/png');
  assert.equal((await bob.put(`/peoples/${p.id}/photo`, png, { 'Content-Type': 'image/png' })).status, 403);
});

test('caller id: formatting, duplicates, partial search, vCard import, ownership', async () => {
  const dad = (await alice.post('/peoples', { name: 'Phone Owner', phone: '01711000111' })).data.people;
  const c = await alice.post('/contacts', { name: 'রহিম', number: '01711000111', connectionId: dad.id });
  assert.equal(c.status, 201);
  assert.equal(c.data.item.number, '+8801711000111');
  assert.equal(c.data.item.peopleId, dad.id, 'auto-linked to the people that owns this number');
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
  assert.equal((await admin.patch(`/admin/users/${me.id}`, { role: 'USER' }, RE)).status, 409, 'cannot demote yourself');
  assert.equal((await admin.patch(`/admin/users/${me.id}`, { isActive: false }, RE)).status, 409);
  assert.equal((await admin.del(`/admin/users/${me.id}`, RE)).status, 409, 'cannot delete yourself');

  // promote carol, then the original admin could be demoted by carol - but never the last admin
  assert.equal((await admin.patch(`/admin/users/${created.data.user.id}`, { role: 'ADMIN' }, RE)).status, 200);
  const carol2 = client(); await carol2.post('/auth/login', { identifier: 'carol', password: created.data.temporaryPassword });
  const CAROL = reauth(created.data.temporaryPassword);
  assert.equal((await carol2.patch(`/admin/users/${me.id}`, { role: 'USER' }, CAROL)).status, 200);
  assert.equal((await admin.get('/admin/stats')).status, 401, 'demoted admin session is revoked immediately');
  assert.equal((await carol2.patch(`/admin/users/${created.data.user.id}`, { role: 'USER' }, CAROL)).status, 409, 'self-demotion blocked');
  await carol2.patch(`/admin/users/${me.id}`, { role: 'ADMIN' }, CAROL); // restore
  assert.equal((await admin.post('/auth/login', { identifier: 'root', password: PW })).status, 200);

  const log = (await carol2.get('/admin/audit-logs?limit=50')).data.items.map((i) => i.action);
  for (const a of ['user.create', 'user.role_change']) assert.ok(log.includes(a), `audit has ${a}`);
  assert.ok(!JSON.stringify(log).includes(created.data.temporaryPassword));
});

test('sessions: password change and deactivation invalidate existing sessions immediately', async () => {
  const u = client();
  await u.post('/auth/register', { displayName: 'Dan', username: 'dan', email: 'dan@test.dev', password: PW });
  await approve('dan');
  assert.equal((await u.post('/auth/login', { identifier: 'dan', password: PW })).status, 200);
  const stolen = client(); stolen.cookie = u.cookie;
  assert.equal((await stolen.get('/auth/me')).status, 200);
  assert.equal((await u.put('/me/password', { currentPassword: 'wrong-password-123', newPassword: 'another-long-password' })).status, 400);
  assert.equal((await u.put('/me/password', { currentPassword: PW, newPassword: 'another-long-password' })).status, 200);
  assert.equal((await u.get('/auth/me')).status, 200, 'the session that changed the password stays signed in');
  assert.equal((await stolen.get('/auth/me')).status, 401, 'old token is dead');

  const id = (await u.get('/auth/me')).data.user.id;
  await admin.patch(`/admin/users/${id}`, { isActive: false }, RE);
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

// ------------------------------------------------------------------ new features
test('approval: sign-ups are PENDING, get no session, see nothing, and need an admin to approve', async () => {
  const c = client();
  const reg = await c.post('/auth/register', { displayName: 'Pat', username: 'pat', email: 'pat@test.dev', password: PW });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.pending, true);
  assert.equal(c.cookie, '', 'no session cookie is issued at registration');
  assert.equal((await c.get('/peoples')).status, 401);

  const wrong = await client().post('/auth/login', { identifier: 'pat', password: 'wrong-password-123' });
  assert.equal(wrong.status, 401, 'wrong password never reveals the pending status');
  const pending = await c.post('/auth/login', { identifier: 'pat', password: PW });
  assert.equal(pending.status, 403);
  assert.equal(pending.data.error.code, 'ACCOUNT_PENDING');
  assert.equal(c.cookie, '');

  // a pending account that somehow holds a valid token is still anonymous
  const { rows } = await query("SELECT id FROM users WHERE username = 'pat'");
  const { signToken } = await import('../src/utils/jwt.js');
  const forged = client(); forged.cookie = `dv_session=${signToken({ id: rows[0].id, token_version: 0 })}`;
  assert.equal((await forged.get('/auth/me')).status, 401);

  assert.equal((await alice.post(`/admin/users/${rows[0].id}/approve`)).status, 403, 'members cannot approve');
  const list = (await admin.get('/admin/users?approval=pending')).data;
  assert.ok(list.items.some((u) => u.username === 'pat' && u.approvalStatus === 'PENDING'));
  assert.ok((await admin.get('/admin/stats')).data.totals.pendingUsers >= 1);

  assert.equal((await admin.post(`/admin/users/${rows[0].id}/approve`)).status, 200);
  assert.equal((await c.post('/auth/login', { identifier: 'pat', password: PW })).status, 200);
  assert.equal((await c.get('/peoples')).status, 200);

  // rejecting kills the live session at once and blocks sign-in
  assert.equal((await admin.post(`/admin/users/${rows[0].id}/reject`)).status, 200);
  assert.equal((await c.get('/peoples')).status, 401);
  assert.equal((await client().post('/auth/login', { identifier: 'pat', password: PW })).data.error.code, 'ACCOUNT_REJECTED');
  const log = (await admin.get('/admin/audit-logs?limit=50')).data.items.map((i) => i.action);
  assert.ok(log.includes('user.approve') && log.includes('user.reject'));
});

test('privacy: anonymous visitors get nothing but the public site name; API responses are never cacheable', async () => {
  const anon = client();
  const guarded = ['/peoples', '/peoples/1', '/peoples/1/photo', '/peoples/1/family', '/peoples/1/posts', '/peoples/options?q=a', '/peoples/facets',
    '/tree/1', '/organizations', '/organizations/1', '/organizations/1/photo', '/organizations/1/members', '/organizations/1/relations', '/organizations/1/structure', '/peoples/1/memberships', '/contacts', '/contacts/relatives', '/search?q=a', '/dashboard', '/posts', '/posts/tags', '/posts/1', '/me', '/admin/stats'];
  for (const u of guarded) assert.equal((await anon.get(u)).status, 401, u);
  assert.equal((await anon.post('/posts', { peopleId: 1, title: 'x' })).status, 401);
  const pub = await anon.get('/settings/public');
  assert.deepEqual(Object.keys(pub.data.settings).sort(), ['blurFemalePhotos', 'cardFields', 'defaultTheme', 'registrationEnabled', 'siteDescription', 'siteName']);
  const res = await fetch(`${base}/peoples`, { headers: { 'X-Requested-With': 'dataverse' } });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

async function freshBob() { const c = client(); assert.equal((await c.post('/auth/login', { identifier: 'bob', password: 'brand-new-password-1' })).status, 200); return c; }

test('peoples: multiple social links, date of death, child & sibling linking', async () => {
  const bob = await freshBob(); // bob's original session was revoked by the password-reset test
  const dad = (await alice.post('/peoples', { name: 'Old Dad', gender: 'MALE', dob: '1940-01-01', dateOfDeath: '2010-06-01',
    socialLinks: ['https://facebook.com/a', 'instagram.com/b', 'instagram.com/b', ' '] })).data.people;
  assert.deepEqual(dad.socialLinks, ['https://facebook.com/a', 'https://instagram.com/b'], 'one flat list; https:// added; duplicates removed');
  assert.equal(dad.dateOfDeath, '2010-06-01');
  assert.equal((await alice.post('/peoples', { name: 'Time Traveller', dob: '2000-01-01', dateOfDeath: '1999-01-01' })).status, 400);
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { dateOfDeath: '1900-01-01' })).status, 400, 'death before the stored birth date');
  assert.equal((await alice.post('/peoples', { name: 'X', socialLinks: ['javascript:alert(1)'] })).status, 422, 'only http(s) links');
  assert.equal((await alice.post('/peoples', { name: 'X', socialLinks: { facebook: ['x'] } })).status, 422, 'the old object shape is gone');
  assert.equal((await alice.post('/peoples', { name: 'X', socialLinks: Array(11).fill('a').map((a, i) => `site${i}.com/u`) })).status, 422);

  const k1 = (await alice.post('/peoples', { name: 'Kid One' })).data.people;
  const k2 = (await alice.post('/peoples', { name: 'Kid Two' })).data.people;
  const upd = await alice.patch(`/peoples/${dad.id}`, { childIds: [k1.id, k2.id] });
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.data.family.children.map((c) => c.id).sort(), [k1.id, k2.id].sort());
  assert.equal((await alice.get(`/peoples/${k1.id}`)).data.people.fatherId, dad.id);
  // siblings share the parent
  assert.deepEqual((await alice.get(`/peoples/${k1.id}`)).data.family.siblings.map((s) => s.id), [k2.id]);
  // unlink one child, link a sibling to k1 instead
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { childIds: [k1.id] })).status, 200);
  assert.equal((await alice.get(`/peoples/${k2.id}`)).data.people.fatherId, null);
  assert.equal((await alice.patch(`/peoples/${k1.id}`, { siblingIds: [k2.id] })).status, 200);
  assert.equal((await alice.get(`/peoples/${k2.id}`)).data.people.fatherId, dad.id);
  assert.equal((await alice.patch(`/peoples/${k1.id}`, { siblingIds: [] })).status, 200);
  assert.equal((await alice.get(`/peoples/${k2.id}`)).data.people.fatherId, null);
  // guards
  assert.equal((await alice.patch(`/peoples/${k1.id}`, { childIds: [dad.id] })).status, 400, 'no gender -> cannot link children');
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { childIds: [dad.id] })).status, 400);
  const grand = (await alice.post('/peoples', { name: 'Grandpa', gender: 'MALE' })).data.people;
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { fatherId: grand.id })).status, 200);
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { childIds: [k1.id, grand.id] })).status, 409, 'an ancestor cannot be a child');
  assert.equal((await alice.patch(`/peoples/${grand.id}`, { siblingIds: [k1.id] })).status, 400, 'no parents linked');
  // someone else's people is protected
  const bobKid = (await bob.post('/peoples', { name: 'Bob Kid', fatherId: grand.id })).data.people;
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { childIds: [k1.id, bobKid.id] })).status, 403, 'cannot overwrite a parent link on a people you cannot edit');
  assert.equal((await alice.get(`/peoples/${bobKid.id}`)).data.people.fatherId, grand.id, 'and nothing was changed');
  const orphan = (await bob.post('/peoples', { name: 'Orphan' })).data.people;
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { childIds: [k1.id, orphan.id] })).status, 200, 'filling an empty parent slot is allowed');
  assert.equal((await alice.patch(`/peoples/${dad.id}`, { childIds: [k1.id] })).status, 403, 'but unlinking someone else\'s people is not');
});

test('posts: markdown content, lower-case tags, feed, tag search, visibility and permissions', async () => {
  const bob = await freshBob();
  const person = (await alice.post('/peoples', { name: 'Post Subject' })).data.people;
  const created = await alice.post('/posts', { peopleId: person.id, title: 'Hello', content: '# Hi\n**bold** <script>alert(1)</script>', tags: ['#Family', 'family', 'Eid 2026'] });
  assert.equal(created.status, 201);
  const post = created.data.post;
  assert.deepEqual(post.tags, ['family', 'eid 2026']);
  assert.equal(post.content, '# Hi\n**bold** <script>alert(1)</script>', 'stored verbatim; rendering escapes it on the client');
  assert.equal(post.author.name, 'Alice');
  assert.equal((await alice.post('/posts', { peopleId: person.id, title: 'x', tags: Array(11).fill('t').map((t, i) => t + i) })).status, 422);
  assert.equal((await alice.post('/posts', { title: 'no people' })).status, 422);

  // bob (not an editor of the people) can post too, and sees alice's post in the feed
  const bobPost = (await bob.post('/posts', { peopleId: person.id, title: 'From Bob', tags: ['news'] })).data.post;
  const feed = (await bob.get('/posts?limit=50')).data;
  assert.ok(feed.items.some((p) => p.id === post.id) && feed.items.some((p) => p.id === bobPost.id));
  assert.equal((await bob.get(`/posts?tag=${encodeURIComponent('family')}`)).data.items.every((p) => p.tags.includes('family')), true);
  assert.equal((await bob.get('/posts?tag=FAMILY')).data.total >= 1, true, 'tag filter is case-insensitive');
  assert.equal((await bob.get('/posts?q=from%20bob')).data.total, 1);
  assert.ok((await bob.get('/posts/tags')).data.items.some((t) => t.value === 'family'));

  // drafts are private to their author; others get 404, not 403
  const draft = (await alice.post('/posts', { peopleId: person.id, title: 'Secret draft', status: 'draft', tags: ['draft'] })).data.post;
  assert.equal((await bob.get(`/posts/${draft.id}`)).status, 404);
  assert.equal((await bob.get('/posts?q=secret')).data.total, 0);
  assert.equal((await alice.get('/posts?q=secret')).data.total, 1);

  // only author / people editor / admin may change a post
  assert.equal((await bob.patch(`/posts/${post.id}`, { title: 'hijack' })).status, 403);
  assert.equal((await bob.del(`/posts/${post.id}`)).status, 403);
  assert.equal((await alice.patch(`/posts/${bobPost.id}`, { title: 'edited by people owner' })).status, 200, 'people editors can moderate posts on their people');
  assert.equal((await alice.patch(`/posts/${post.id}`, { tags: ['updated'] })).data.post.tags[0], 'updated');
  assert.equal((await admin.del(`/posts/${bobPost.id}`)).status, 204);
  const peoplePosts = (await alice.get(`/peoples/${person.id}/posts`)).data.items;
  assert.ok(peoplePosts.some((p) => p.id === post.id) && peoplePosts.every((p) => p.subject.id === person.id && p.subject.kind === 'people'));

  // long content is excerpted in the feed and full on the single-post endpoint
  const long = (await alice.post('/posts', { peopleId: person.id, title: 'Long', content: 'x'.repeat(5000) })).data.post;
  const inFeed = (await alice.get('/posts?q=Long')).data.items.find((p) => p.id === long.id);
  assert.equal(inFeed.truncated, true);
  assert.equal((await alice.get(`/posts/${long.id}`)).data.post.content.length, 5000);

  // admin switch: contributions off blocks members but not admins
  await admin.put('/admin/settings', { allow_user_contributions: false });
  assert.equal((await bob.post('/posts', { peopleId: person.id, title: 'blocked' })).status, 403);
  assert.equal((await admin.post('/posts', { peopleId: person.id, title: 'admin ok' })).status, 201);
  await admin.put('/admin/settings', { allow_user_contributions: true });
});

// ------------------------------------------------------------------ entities, marriages, links
test('multiple spouses: each marriage is kept, the current one is tracked, endings update marital status', async () => {
  const man = (await alice.post('/peoples', { name: 'Many Marriages', gender: 'MALE' })).data.people;
  const w1 = (await alice.post('/peoples', { name: 'First Wife', gender: 'FEMALE' })).data.people;
  const w2 = (await alice.post('/peoples', { name: 'Second Wife', gender: 'FEMALE' })).data.people;
  const r = await alice.patch(`/peoples/${man.id}`, { spouses: [
    { personId: w1.id, marriedOn: '1990-01-01', endedOn: '1999-01-01', endReason: 'DIVORCED' },
    { personId: w2.id, marriedOn: '2000-05-05' }] });
  assert.equal(r.status, 200);
  const fam = r.data.family;
  assert.equal(fam.spouses.length, 2);
  assert.deepEqual(fam.spouses.map((s) => [s.person.id, s.current]), [[w1.id, false], [w2.id, true]]);
  assert.equal(fam.spouse.id, w2.id, 'spouse = current spouse');
  assert.equal((await alice.get(`/peoples/${w1.id}`)).data.family.spouses[0].person.id, man.id, 'visible from the other side');
  assert.equal((await alice.get(`/peoples/${w1.id}`)).data.family.spouse, null, 'ended marriage is not current');
  // ending the current marriage as widowed
  const r2 = await alice.patch(`/peoples/${man.id}`, { maritalStatus: 'MARRIED', spouses: [
    { personId: w1.id, marriedOn: '1990-01-01', endedOn: '1999-01-01', endReason: 'DIVORCED' },
    { personId: w2.id, marriedOn: '2000-05-05', endedOn: '2020-01-01', endReason: 'WIDOWED' }] });
  assert.equal(r2.data.family.spouse, null);
  assert.equal(r2.data.people.maritalStatus, 'WIDOWED');
  // tree shows every spouse
  const kid = (await alice.post('/peoples', { name: 'Kid', fatherId: man.id })).data.people;
  assert.ok(kid.id);
  const t = (await alice.get(`/tree/${man.id}`)).data;
  assert.equal(t.descendants.spouses.length, 2);
  // guards
  assert.equal((await alice.patch(`/peoples/${man.id}`, { spouses: [{ personId: man.id }] })).status, 400);
  assert.equal((await alice.patch(`/peoples/${man.id}`, { spouses: [{ personId: w1.id }, { personId: w1.id }] })).status, 422);
  assert.equal((await alice.patch(`/peoples/${man.id}`, { spouses: [{ personId: w1.id, marriedOn: '2000-01-01', endedOn: '1990-01-01' }] })).status, 400);
  // removing a spouse removes the marriage on both sides
  await alice.patch(`/peoples/${man.id}`, { spouses: [{ personId: w2.id, marriedOn: '2000-05-05' }] });
  assert.equal((await alice.get(`/peoples/${w1.id}`)).data.family.spouses.length, 0);
});

test('organizations: types, members, sub-units, any organization as root, loop and permission rules', async () => {
  const bob = await freshBob();
  const mk = async (b, who = alice) => (await who.post('/organizations', b)).data.organization;
  const party = await mk({ name: 'Test Party', orgType: 'POLITICAL_PARTY', about: 'a party', website: 'testparty.org', socialLinks: ['fb.com/tp'] });
  assert.equal(party.orgType, 'POLITICAL_PARTY');
  assert.equal(party.website, 'https://testparty.org', 'bare domains get https://');
  assert.deepEqual(party.socialLinks, ['https://fb.com/tp']);
  const wing = await mk({ name: 'Youth Wing', orgType: 'GROUP' });
  const branch = await mk({ name: 'Dhaka Branch', orgType: 'GROUP' });
  const company = await mk({ name: 'Acme Ltd', orgType: 'COMPANY' });
  assert.equal((await alice.post('/organizations', { name: 'X', orgType: 'FAMILY' })).status, 422, 'Family is not an organization type');
  assert.equal((await alice.post('/organizations', { name: 'X', nid: '123' })).status, 422, 'organizations have no NID');
  assert.equal((await alice.post('/organizations', { name: 'X', occupation: 'x', educationLevel: 'y' })).status, 422, 'no work / education');
  assert.equal((await alice.post('/organizations', { name: 'X', website: 'javascript:alert(1)' })).status, 422, 'only http(s) websites');
  assert.equal((await alice.post('/organizations', { name: 'D', foundedOn: '2000-01-01', dissolvedOn: '1999-01-01' })).status, 400);
  const person = (await alice.post('/peoples', { name: 'A Member', gender: 'MALE', website: 'https://example.com/me' })).data.people;
  assert.equal(person.website, 'https://example.com/me');
  assert.equal((await alice.post('/peoples', { name: 'Bad site', website: 'ftp://x.y' })).status, 422);
  assert.equal((await alice.post('/peoples', { name: 'Y', entityType: 'GROUP' })).status, 422, 'humans have no entity type any more');
  assert.equal((await alice.get(`/organizations/${party.id}`)).data.organization.name, 'Test Party');
  assert.equal((await alice.get(`/peoples/${party.id}`)).status === 200 && party.id === person.id, false, 'separate id spaces');

  const org = (b, who = alice) => who.post('/org-links', b);
  assert.equal((await org({ fromId: wing.id, toId: party.id, linkType: 'SUB_UNIT_OF' })).status, 201);
  assert.equal((await org({ fromId: branch.id, toId: wing.id, linkType: 'SUB_UNIT_OF' })).status, 201);
  assert.equal((await org({ fromId: party.id, toId: branch.id, linkType: 'SUB_UNIT_OF' })).status, 409, 'no loops');
  assert.equal((await org({ fromId: party.id, toId: party.id, linkType: 'CONNECTED_TO' })).status, 400);
  assert.equal((await org({ fromId: company.id, toId: party.id, linkType: 'AFFILIATED_WITH' })).status, 201);
  assert.equal((await org({ fromId: party.id, toId: company.id, linkType: 'AFFILIATED_WITH' })).status, 409, 'symmetric duplicate');
  assert.equal((await org({ fromId: company.id, toId: wing.id, linkType: 'MEMBER_OF' })).status, 201, 'an organization can be a member of another');

  const member = (b, who = alice) => who.post('/memberships', b);
  assert.equal((await member({ peopleId: person.id, organizationId: branch.id, role: 'Secretary', startedOn: '2015-01-01' })).status, 201);
  assert.equal((await member({ peopleId: person.id, organizationId: party.id })).status, 201, 'a person can belong to several organizations');
  assert.equal((await member({ peopleId: person.id, organizationId: company.id, relation: 'AFFILIATED', role: 'Consultant' })).status, 201);
  assert.equal((await member({ peopleId: person.id, organizationId: branch.id })).status, 409, 'duplicate');
  assert.equal((await member({ peopleId: 999999, organizationId: branch.id })).status, 404);
  assert.equal((await member({ peopleId: person.id, organizationId: branch.id, relation: 'MEMBER', startedOn: '2020-01-01', endedOn: '2010-01-01' })).status, 422);
  assert.equal((await member({ peopleId: person.id, organizationId: party.id, relation: 'ENEMY' })).status, 422);

  const mine = (await alice.get(`/peoples/${person.id}/memberships`)).data.items;
  assert.deepEqual(mine.map((m) => [m.organization.name, m.relation]).sort(), [['Acme Ltd', 'AFFILIATED'], ['Dhaka Branch', 'MEMBER'], ['Test Party', 'MEMBER']]);
  assert.equal(mine.find((m) => m.organization.name === 'Dhaka Branch').role, 'Secretary');
  const rel = (await alice.get(`/organizations/${party.id}/relations`)).data;
  assert.equal(rel.memberCount, 1); assert.equal(rel.subUnitCount, 1);
  assert.ok(rel.items.some((l) => l.other.name === 'Youth Wing' && l.direction === 'in' && l.linkType === 'SUB_UNIT_OF'));
  const members = (await alice.get(`/organizations/${branch.id}/members`)).data;
  assert.equal(members.total, 1); assert.equal(members.items[0].people.name, 'A Member'); assert.equal(members.items[0].role, 'Secretary');
  assert.equal((await alice.get(`/organizations/${branch.id}/members?q=nobody`)).data.total, 0);

  const top = (await alice.get(`/organizations/${party.id}/structure?depth=3`)).data.root;
  assert.equal(top.children[0].name, 'Youth Wing');
  assert.equal(top.children[0].children[0].name, 'Dhaka Branch');
  assert.equal(top.children[0].children[0].memberCount, 1);
  const mid = (await alice.get(`/organizations/${wing.id}/structure`)).data.root;
  assert.equal(mid.children[0].name, 'Dhaka Branch', 'any organization can be the root');
  const shallow = (await alice.get(`/organizations/${party.id}/structure?depth=1`)).data.root;
  assert.equal(shallow.children[0].children.length, 0);
  assert.equal(shallow.children[0].subUnitCount, 1);

  // permissions
  assert.equal((await member({ peopleId: person.id, organizationId: wing.id }, bob)).status, 403, 'bob can edit neither side');
  const mid1 = mine[0].id;
  assert.equal((await bob.del(`/memberships/${mid1}`)).status, 403);
  assert.equal((await bob.patch(`/memberships/${mid1}`, { role: 'Hacker' })).status, 403);
  assert.equal((await bob.patch(`/organizations/${party.id}`, { name: 'Hijacked' })).status, 403);
  assert.equal((await bob.del(`/organizations/${party.id}`)).status, 403);
  assert.equal((await org({ fromId: branch.id, toId: company.id, linkType: 'CONNECTED_TO' }, bob)).status, 403);
  assert.equal((await alice.patch(`/memberships/${mid1}`, { role: 'Chair', endedOn: '2022-01-01' })).status, 200);
  assert.equal((await alice.patch(`/memberships/${mid1}`, { startedOn: '2023-01-01' })).status, 400);
  assert.equal((await admin.patch(`/organizations/${party.id}`, { shortName: 'TP' })).status, 200);
  assert.equal((await admin.del(`/memberships/${mid1}`)).status, 204);

  // lists, options, filters; organizations are not mixed into people lists
  assert.ok((await alice.get('/organizations?orgType=GROUP')).data.items.every((o) => o.orgType === 'GROUP'));
  assert.equal((await alice.get('/organizations?q=Test%20Party')).data.items[0].name, 'Test Party');
  assert.ok((await alice.get('/organizations/options?q=Acme')).data.items.some((o) => o.name === 'Acme Ltd'));
  assert.equal((await alice.get('/peoples?q=Test%20Party')).data.total, 0);
  assert.ok((await alice.get('/search?q=Acme')).data.organizations.some((o) => o.name === 'Acme Ltd'));
  // posts about an organization
  const op = (await alice.post('/posts', { organizationId: party.id, title: 'Party news', tags: ['news'] })).data.post;
  assert.equal(op.subject.kind, 'organization'); assert.equal(op.subject.name, 'Test Party');
  assert.equal((await alice.post('/posts', { organizationId: party.id, peopleId: person.id, title: 'both' })).status, 422, 'exactly one subject');
  assert.equal((await alice.post('/posts', { title: 'none' })).status, 422);
  assert.equal((await alice.get(`/organizations/${party.id}/posts`)).data.items.length, 1);
  assert.ok((await alice.get('/posts?limit=50')).data.items.some((p) => p.id === op.id));
  // logo
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  assert.equal((await alice.put(`/organizations/${party.id}/photo`, png, { 'Content-Type': 'image/png' })).status, 200);
  assert.equal((await bob.get(`/organizations/${party.id}/photo`)).type, 'image/png');
  assert.equal((await bob.put(`/organizations/${party.id}/photo`, png, { 'Content-Type': 'image/png' })).status, 403);
  // deleting an organization removes its links, memberships, logo and posts; people are untouched
  assert.equal((await alice.del(`/organizations/${branch.id}`)).status, 204);
  assert.equal((await query('SELECT count(*)::int AS n FROM memberships WHERE organization_id = $1', [branch.id])).rows[0].n, 0);
  assert.equal((await alice.get(`/peoples/${person.id}`)).status, 200);
  assert.equal((await alice.del(`/organizations/${party.id}`)).status, 204);
  assert.equal((await query('SELECT count(*)::int AS n FROM posts WHERE organization_id = $1', [party.id])).rows[0].n, 0);
});

test('blur setting: public flag, admin-only toggle, audited', async () => {
  assert.equal((await client().get('/settings/public')).data.settings.blurFemalePhotos, false, 'off by default');
  assert.equal((await alice.put('/admin/settings', { blur_female_photos: true })).status, 403);
  assert.equal((await admin.put('/admin/settings', { blur_female_photos: 'yes' })).status, 422);
  assert.equal((await admin.put('/admin/settings', { blur_female_photos: true })).status, 200);
  assert.equal((await client().get('/settings/public')).data.settings.blurFemalePhotos, true);
  assert.equal((await admin.get('/admin/settings')).data.settings.blur_female_photos, true);
  await admin.put('/admin/settings', { blur_female_photos: false });
  assert.equal((await client().get('/settings/public')).data.settings.blurFemalePhotos, false);
});

test('people extras: permanent address inherited from the father, caller-id phonebook count, newest-first default', async () => {
  const grand = (await alice.post('/peoples', { name: 'Grand Dad', gender: 'MALE', district: 'Comilla', street: 'Old village', country: 'Bangladesh' })).data.people;
  const dad = (await alice.post('/peoples', { name: 'Middle Dad', gender: 'MALE', fatherId: grand.id })).data;
  const kid = (await alice.post('/peoples', { name: 'Young Kid', fatherId: dad.people.id })).data;
  assert.equal(kid.people.district, null, 'stored value is untouched');
  assert.equal(kid.people.inheritedAddress.district, 'Comilla', 'inherited through the paternal chain');
  assert.equal(kid.people.inheritedAddress.from.name, 'Grand Dad');
  assert.equal(dad.people.inheritedAddress.from.id, grand.id);
  await alice.patch(`/peoples/${kid.people.id}`, { district: 'Dhaka' });
  assert.equal((await alice.get(`/peoples/${kid.people.id}`)).data.people.inheritedAddress, null, 'own address wins');
  assert.equal((await alice.get(`/peoples/${grand.id}`)).data.people.inheritedAddress, null);

  await alice.post('/contacts', { name: 'C1', number: '01711999001', connectionId: kid.people.id });
  await alice.post('/contacts', { name: 'C2', number: '01711999002', connectionId: kid.people.id });
  assert.equal((await alice.get(`/peoples/${kid.people.id}`)).data.people.savedContactsCount, 2);
  assert.equal((await alice.get(`/peoples/${grand.id}`)).data.people.savedContactsCount, 0);

  const list = (await alice.get('/peoples?limit=5')).data.items;
  assert.ok(list.every((p, i) => i === 0 || list[i - 1].id > p.id), 'default order is newest first');
});

test('step-up authentication: sensitive admin actions need the admin password again', async () => {
  const mkUser = async (name) => (await admin.post('/admin/users', { displayName: name, username: name, email: `${name}@test.dev`, password: PW, role: 'USER', mustChangePassword: false })).data.user;
  const u = await mkUser('victim1');
  assert.equal((await admin.del(`/admin/users/${u.id}`)).data.error.code, 'REAUTH_REQUIRED');
  assert.equal((await admin.del(`/admin/users/${u.id}`, reauth('wrong-password'))).data.error.code, 'REAUTH_FAILED');
  assert.equal((await alice.del(`/admin/users/${u.id}`, RE)).status, 403, 'members never reach it');
  assert.equal((await admin.get(`/admin/users/${u.id}`)).status, 200, 'still there');
  assert.equal((await admin.del(`/admin/users/${u.id}`, RE)).status, 204);
  const v = await mkUser('victim2');
  assert.equal((await admin.post(`/admin/users/${v.id}/reset-password`, {})).status, 403);
  assert.equal((await admin.post(`/admin/users/${v.id}/reset-password`, {}, RE)).status, 200);
  assert.equal((await admin.patch(`/admin/users/${v.id}`, { role: 'ADMIN' })).status, 403);
  assert.equal((await admin.patch(`/admin/users/${v.id}`, { isActive: false })).status, 403);
  assert.equal((await admin.patch(`/admin/users/${v.id}`, { displayName: 'Renamed' })).status, 200);
  assert.equal((await admin.patch(`/admin/users/${v.id}`, { isActive: false }, RE)).status, 200);
  assert.equal((await admin.patch(`/admin/users/${v.id}`, { isActive: true })).status, 200);
  const owner = (await alice.post('/peoples', { name: 'Book Owner' })).data.people;
  await alice.post('/contacts', { name: 'X1', number: '01711888001', connectionId: owner.id });
  assert.equal((await admin.del(`/admin/contacts/phonebook/${owner.id}`)).status, 403);
  assert.equal((await query('SELECT count(*)::int AS n FROM caller_contacts WHERE connection_id = $1', [owner.id])).rows[0].n, 1, 'nothing deleted without the password');
  const gone = await admin.del(`/admin/contacts/phonebook/${owner.id}`, RE);
  assert.equal(gone.status, 200); assert.equal(gone.data.deleted, 1);
  assert.equal((await admin.del(`/admin/users/${v.id}`, { 'X-Confirm-Password': '%%%not-base64%%%' })).status, 403);
  const failures = (await admin.get('/admin/audit-logs?action=security.reauth_failed&limit=50')).data.items;
  assert.ok(failures.length >= 2 && failures.every((f) => !JSON.stringify(f).includes('wrong-password')), 'failures are logged without the password');
  await admin.del(`/admin/users/${v.id}`, RE);
});

test('step-up lockout: only wrong passwords count, and 5 of them lock the account out of sensitive actions', async () => {
  const mk = await admin.post('/admin/users', { displayName: 'Lockee', username: 'lockee', email: 'lockee@test.dev', password: PW, role: 'ADMIN', mustChangePassword: false });
  const l = client(); assert.equal((await l.post('/auth/login', { identifier: 'lockee', password: PW })).status, 200);
  const tr = await admin.post('/admin/users', { displayName: 'Tee', username: 'lockt', email: 'lockt@test.dev', password: PW, role: 'USER' });
  assert.equal(tr.status, 201, JSON.stringify(tr.data));
  const target = tr.data.user;
  for (let i = 0; i < 12; i++) assert.equal((await l.post(`/admin/users/${target.id}/reset-password`, {}, reauth(PW))).status, 200, 'correct passwords are never throttled');
  for (let i = 0; i < 5; i++) assert.equal((await l.del(`/admin/users/${target.id}`, reauth('nope-nope'))).data.error.code, 'REAUTH_FAILED');
  assert.equal((await l.del(`/admin/users/${target.id}`, reauth(PW))).status, 429, 'even the right password is refused during the lockout');
  assert.equal((await admin.get(`/admin/users/${target.id}`)).status, 200, 'nothing was deleted');
  assert.equal((await admin.del(`/admin/users/${target.id}`, RE)).status, 204, 'other administrators are unaffected');
  await admin.del(`/admin/users/${mk.data.user.id}`, RE);
});

test('family: link an existing relative or create a new one that inherits shared data', async () => {
  const bob = await freshBob();
  const dad = (await alice.post('/peoples', { name: 'Fam Dad', gender: 'MALE', religion: 'Islam', lineage: 'Khan', district: 'Comilla', street: 'Old Road' })).data.people;
  const add = (id, b, who = alice) => who.post(`/peoples/${id}/family`, b);
  const get = async (id) => (await alice.get(`/peoples/${id}`)).data.people;
  const r1 = await add(dad.id, { relation: 'child', create: { name: 'Fam Kid', gender: 'FEMALE' } });
  assert.equal(r1.status, 201); assert.equal(r1.data.created, true);
  const kid = await get(r1.data.addedId);
  assert.deepEqual([kid.fatherId, kid.religion, kid.lineage, kid.district, kid.street, kid.gender], [dad.id, 'Islam', 'Khan', 'Comilla', 'Old Road', 'FEMALE']);
  const r2 = await add(dad.id, { relation: 'spouse', create: { name: 'Fam Wife' } });
  const wife = await get(r2.data.addedId);
  assert.equal(wife.gender, 'FEMALE', 'spouse gets the opposite gender'); assert.equal(wife.religion, 'Islam');
  assert.equal(r2.data.family.spouse.id, wife.id);
  const kid2 = await get((await add(dad.id, { relation: 'child', create: { name: 'Fam Kid Two' } })).data.addedId);
  assert.deepEqual([kid2.fatherId, kid2.motherId], [dad.id, wife.id], 'the other parent is the current spouse');
  const kid3 = await get((await add(kid.id, { relation: 'sibling', create: { name: 'Fam Kid Three' } })).data.addedId);
  assert.equal(kid3.fatherId, dad.id); assert.equal(kid3.lineage, 'Khan'); assert.equal(kid3.district, 'Comilla');
  const lone = (await alice.post('/peoples', { name: 'Lone', religion: 'Hinduism', district: 'Dhaka' })).data.people;
  const fr = await add(lone.id, { relation: 'father', create: { name: 'Lone Father' } });
  const father = await get(fr.data.addedId);
  assert.deepEqual([father.gender, father.religion, father.district], ['MALE', 'Hinduism', 'Dhaka']);
  assert.equal((await get(lone.id)).fatherId, father.id);
  assert.equal((await add(lone.id, { relation: 'father', create: { name: 'Another Father' } })).status, 409, 'a father is already linked');
  const mr = await add(lone.id, { relation: 'mother', create: { name: 'Lone Mother' } });
  assert.equal((await get(mr.data.addedId)).gender, 'FEMALE');
  const nobody = (await alice.post('/peoples', { name: 'Nobody' })).data.people;
  assert.equal((await add(nobody.id, { relation: 'sibling', create: { name: 'S' } })).status, 400);
  const other = (await alice.post('/peoples', { name: 'Existing Kid' })).data.people;
  assert.equal((await add(dad.id, { relation: 'child', existingId: other.id })).status, 201);
  assert.equal((await get(other.id)).fatherId, dad.id);
  assert.equal((await add(dad.id, { relation: 'child', existingId: other.id })).status, 409, 'already linked');
  const sib = (await alice.post('/peoples', { name: 'Existing Sibling' })).data.people;
  assert.equal((await add(kid.id, { relation: 'sibling', existingId: sib.id })).status, 201);
  assert.equal((await get(sib.id)).fatherId, dad.id);
  const ex = (await alice.post('/peoples', { name: 'Ex Spouse' })).data.people;
  assert.equal((await add(dad.id, { relation: 'spouse', existingId: ex.id })).data.family.spouses.length, 2);
  assert.equal((await add(dad.id, { relation: 'spouse', existingId: ex.id })).status, 409);
  assert.equal((await add(dad.id, { relation: 'child', existingId: dad.id })).status, 400);
  assert.equal((await add(dad.id, { relation: 'child', existingId: 99999999 })).status, 400);
  assert.equal((await add(dad.id, { relation: 'cousin', existingId: other.id })).status, 422);
  assert.equal((await add(dad.id, { relation: 'child', existingId: other.id, create: { name: 'Both' } })).status, 422);
  assert.equal((await add(dad.id, { relation: 'child' })).status, 422);
  assert.equal((await add(dad.id, { relation: 'child', create: { name: '' } })).status, 422);
  assert.equal((await add(dad.id, { relation: 'child', create: { name: 'Hacked' } }, bob)).status, 403, "bob cannot edit alice's person");
  assert.equal((await alice.get('/peoples?q=Hacked')).data.total, 0);
  assert.equal((await add(dad.id, { relation: 'mother', existingId: kid.id })).status, 409, "a person's own descendant cannot become their parent");
});

test('tags: #search across peoples, organizations and posts; lower-case; autocomplete with usage counts', async () => {
  const bob = await freshBob();
  const person = (await alice.post('/peoples', { name: 'Tag Person', tags: ['#BD', 'tagnews'] })).data.people;
  assert.deepEqual(person.tags, ['bd', 'tagnews']);
  const org = (await alice.post('/organizations', { name: 'Tag Org', tags: ['bd', 'bdparty'] })).data.organization;
  const post = (await alice.post('/posts', { peopleId: person.id, title: 'Tag Post', tags: ['#BD', 'x1'] })).data.post;
  await alice.post('/posts', { peopleId: person.id, title: 'Tag Draft', status: 'draft', tags: ['bd'] });
  const names = (r) => r.data.items.map((i) => i.name || i.title);
  assert.ok(names(await alice.get('/peoples?q=%23bd')).includes('Tag Person'));
  assert.ok(names(await alice.get('/organizations?q=%23BD')).includes('Tag Org'), 'case-insensitive');
  assert.ok(names(await alice.get('/posts?q=%23bd')).includes('Tag Post'));
  const all = (await alice.get('/search?q=%23bd')).data;
  assert.ok(all.peoples.some((p) => p.id === person.id) && all.organizations.some((o) => o.id === org.id) && all.posts.some((p) => p.id === post.id), 'global search finds all three');
  assert.equal((await alice.get('/peoples?q=%23bd%20%23tagnews')).data.total >= 1, true);
  assert.equal((await alice.get('/peoples?q=%23bd%20%23nosuchtag')).data.total, 0, 'every #tag must match');
  assert.equal((await alice.get('/peoples?q=%23bd%20Tag%20Person')).data.total, 1, 'tag + words');
  assert.equal((await alice.get('/peoples?q=%23nosuchtag')).data.total, 0);
  const top = (await alice.get('/tags')).data.items;
  assert.ok(top.length <= 5 && top.every((t, i) => i === 0 || top[i - 1].count >= t.count), 'top 5 by usage');
  const a = (await alice.get('/tags?prefix=bd')).data.items.find((t) => t.value === 'bd');
  const b = (await bob.get('/tags?prefix=%23bd')).data.items.find((t) => t.value === 'bd');
  assert.equal(a.count, b.count + 1, "counts include the viewer's own draft but nobody else's");
  const pre = (await alice.get('/tags?prefix=b&limit=5')).data.items;
  assert.ok(pre.length >= 2 && pre.every((t) => t.value.startsWith('b')), 'only tags beginning with the prefix');
  assert.deepEqual((await alice.get('/tags?prefix=B')).data.items.map((t) => t.value), pre.map((t) => t.value), 'prefix is case-insensitive');
  assert.equal((await alice.get('/tags?limit=50')).status, 422);
  assert.equal((await client().get('/tags')).status, 401);
  assert.deepEqual((await alice.get('/tags?prefix=%25')).data.items, [], 'LIKE wildcards are escaped');
});

test('bulk import: many people into an organization with roles, validated first, all-or-nothing', async () => {
  const bob = await freshBob();
  const org = (await alice.post('/organizations', { name: 'Import Org', orgType: 'GROUP' })).data.organization;
  const url = (id = org.id, q = '') => `/organizations/${id}/import-peoples${q}`;
  const body = { _help: 'ignored', defaults: { district: 'Dhaka', tags: ['Imported'] }, peoples: [
    { name: 'Imp One', role: 'President', gender: 'MALE', phone: '01711555001', startedOn: '2020-01-01' },
    { name: 'Imp Two', role: 'Treasurer', religion: 'Islam', district: 'Khulna' },
    { name: 'Imp Three' }] };
  const dry = await alice.post(url(org.id, '?dryRun=1'), body);
  assert.equal(dry.status, 200); assert.equal(dry.data.dryRun, true); assert.equal(dry.data.created, 3);
  assert.equal((await alice.get(`/organizations/${org.id}/members`)).data.total, 0, 'a dry run saves nothing');
  assert.equal((await alice.get('/peoples?q=Imp%20One')).data.total, 0);
  const real = await alice.post(url(), body);
  assert.equal(real.status, 201); assert.equal(real.data.created, 3);
  const members = (await alice.get(`/organizations/${org.id}/members?limit=10`)).data;
  assert.equal(members.total, 3);
  assert.deepEqual(members.items.map((m) => [m.people.name, m.role]).sort(), [['Imp One', 'President'], ['Imp Three', null], ['Imp Two', 'Treasurer']]);
  const one = (await alice.get(`/peoples/${members.items.find((m) => m.people.name === 'Imp One').people.id}`)).data.people;
  assert.deepEqual([one.district, one.tags, one.gender], ['Dhaka', ['imported'], 'MALE'], 'defaults applied');
  assert.equal((await alice.get(`/peoples/${members.items.find((m) => m.people.name === 'Imp Two').people.id}`)).data.people.district, 'Khulna', 'row beats default');
  const again = await alice.post(url(), body);
  assert.equal(again.data.linkedExisting, 1); assert.equal(again.data.alreadyMember, 1);
  assert.equal((await alice.get('/peoples?q=01711555001')).data.total, 1, 'no duplicate for the same phone');
  const before = (await query('SELECT count(*)::int AS n FROM peoples')).rows[0].n;
  const bad = await alice.post(url(), { peoples: [{ name: 'Fine' }, { role: 'No name' }, { name: 'Odd', gender: 'X' }, { name: 'Extra', hacker: 1 }, { name: 'Mail', email: 'nope' }] });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.data.error.details.rows.map((r) => r.index), [2, 3, 4, 5]);
  assert.equal((await query('SELECT count(*)::int AS n FROM peoples')).rows[0].n, before, 'all-or-nothing');
  assert.equal((await alice.post(url(), { peoples: [] })).status, 400);
  assert.equal((await alice.post(url(), { peoples: Array.from({ length: 501 }, (_, i) => ({ name: `N${i}` })) })).status, 400, 'at most 500 rows');
  assert.equal((await alice.post(url(), { peoples: 'nope' })).status, 400);
  assert.equal((await alice.post(url(), { organizationId: 1, peoples: [{ name: 'A' }] })).status, 400, 'unknown top-level keys are rejected');
  assert.equal((await bob.post(url(), body)).status, 403);
  assert.equal((await client().post(url(), body)).status, 401);
  assert.equal((await alice.post(url(999999), body)).status, 404);
  assert.equal((await admin.post(url(org.id, '?dryRun=true'), { peoples: [{ name: 'Admin Row', role: 'Observer', relation: 'AFFILIATED' }] })).status, 200);
  assert.ok((await admin.get('/admin/audit-logs?action=organization.import')).data.total >= 1);
});

test('organizations: sub-units without a logo show the parent logo; own logo wins', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const mk = async (name) => (await alice.post('/organizations', { name, orgType: 'GROUP' })).data.organization;
  const root = await mk('Logo Root'); const mid = await mk('Logo Mid'); const leaf = await mk('Logo Leaf'); const stray = await mk('Logo Stray');
  await alice.post('/org-links', { fromId: mid.id, toId: root.id, linkType: 'SUB_UNIT_OF' });
  await alice.post('/org-links', { fromId: leaf.id, toId: mid.id, linkType: 'SUB_UNIT_OF' });
  await alice.put(`/organizations/${root.id}/photo`, png, { 'Content-Type': 'image/png' });
  const rootUrl = (await alice.get(`/organizations/${root.id}`)).data.organization.photoUrl;
  assert.match(rootUrl, new RegExp(`/api/organizations/${root.id}/photo\\?v=`));
  const midOrg = (await alice.get(`/organizations/${mid.id}`)).data.organization;
  assert.equal(midOrg.photoUrl, rootUrl); assert.equal(midOrg.logoInherited, true);
  assert.equal((await alice.get(`/organizations/${leaf.id}`)).data.organization.photoUrl, rootUrl, 'nearest ancestor with a logo, however deep');
  assert.equal((await alice.get(`/organizations/${stray.id}`)).data.organization.photoUrl, null, 'only sub-units inherit');
  const listed = (await alice.get('/organizations?q=Logo')).data.items;
  assert.equal(listed.find((o) => o.name === 'Logo Leaf').photoUrl, rootUrl, 'lists show it too');
  assert.equal(listed.find((o) => o.name === 'Logo Root').logoInherited, false);
  await alice.put(`/organizations/${mid.id}/photo`, png, { 'Content-Type': 'image/png' });
  const midNow = (await alice.get(`/organizations/${mid.id}`)).data.organization;
  assert.match(midNow.photoUrl, new RegExp(`/organizations/${mid.id}/photo`)); assert.equal(midNow.logoInherited, false);
  assert.match((await alice.get(`/organizations/${leaf.id}`)).data.organization.photoUrl, new RegExp(`/organizations/${mid.id}/photo`), 'now the nearer parent wins');
});

test('caller id items carry the photo of whoever the number belongs to', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const withPhoto = (await alice.post('/peoples', { name: 'Photo Owner', phone: '01711777001' })).data.people;
  await alice.put(`/peoples/${withPhoto.id}/photo`, png, { 'Content-Type': 'image/png' });
  const noPhoto = (await alice.post('/peoples', { name: 'No Photo Owner', phone: '01711777002', gender: 'FEMALE' })).data.people;
  await alice.post('/contacts', { name: 'Has Photo', number: '01711777001' });
  await alice.post('/contacts', { name: 'No Photo', number: '01711777002' });
  await alice.post('/contacts', { name: 'Unknown', number: '01711777003' });
  const items = (await alice.get('/contacts?q=0171177700&limit=10')).data.items;
  const by = (n) => items.find((c) => c.name === n);
  assert.match(by('Has Photo').photoUrl, new RegExp(`/api/peoples/${withPhoto.id}/photo\\?v=`));
  assert.equal(by('No Photo').photoUrl, null); assert.equal(by('No Photo').peopleId, noPhoto.id);
  assert.equal(by('Unknown').photoUrl, null);
});

test('dashboard: totals, 14-day series, tags, districts, my contributions', async () => {
  const d = (await alice.get('/dashboard')).data;
  for (const k of ['peoples', 'organizations', 'contacts', 'posts', 'memberships']) assert.equal(typeof d.totals[k], 'number', k);
  assert.equal(d.daily.length, 14);
  assert.ok(d.daily.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day) && ['peoples', 'organizations', 'contacts', 'posts'].every((k) => Number.isInteger(x[k]))));
  assert.ok(d.daily.at(-1).peoples >= 1, "today's new people are counted");
  assert.ok(Array.isArray(d.topTags) && Array.isArray(d.districts) && Array.isArray(d.orgTypes) && Array.isArray(d.recentPeoples) && Array.isArray(d.recentOrganizations) && Array.isArray(d.recentPosts));
  assert.ok(d.mine.peoples >= 1);
  assert.equal(d.pendingUsers, 0, 'only admins see the pending count');
  assert.equal((await client().get('/dashboard')).status, 401);
  const stats = (await admin.get('/admin/stats')).data;
  assert.equal(stats.daily.length, 14);
  assert.ok(stats.daily.at(-1).peoples >= 1 && stats.daily.at(-1).organizations >= 1, 'the admin chart data is not empty');
});

test('card fields setting: admin chooses what cards show; validated; public flag exposes it', async () => {
  const pub = (await client().get('/settings/public')).data.settings.cardFields;
  assert.ok(Array.isArray(pub.people) && Array.isArray(pub.organization));
  assert.equal((await alice.put('/admin/settings', { card_fields: { people: ['phone'], organization: [] } })).status, 403);
  assert.equal((await admin.put('/admin/settings', { card_fields: { people: ['phone', 'email', 'age'], organization: ['website'] } })).status, 200);
  assert.deepEqual((await client().get('/settings/public')).data.settings.cardFields, { people: ['phone', 'email', 'age'], organization: ['website'] });
  assert.equal((await admin.put('/admin/settings', { card_fields: { people: ['nid'], organization: [] } })).status, 422, 'NID can never be shown on cards');
  assert.equal((await admin.put('/admin/settings', { card_fields: { people: ['phone', 'phone'], organization: [] } })).status, 422);
  assert.equal((await admin.put('/admin/settings', { card_fields: { people: ['phone'], organization: ['politicalView'] } })).status, 422);
  await admin.put('/admin/settings', { card_fields: { people: ['nickname', 'occupation', 'district'], organization: ['district', 'foundedOn'] } });
});

test('favicons: SSRF guards, strict domains, cache, login required', async () => {
  const { isPrivateAddress, safeLookup, DOMAIN_RE } = await import('../src/services/faviconService.js');
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  for (const d of ['facebook.com', 'sub.example.co.uk', 'a-b.org']) assert.ok(DOMAIN_RE.test(d), d);
  for (const d of ['localhost', '127.0.0.1', 'a', 'x.y', 'evil.com/path', 'evil.com:8080', 'a b.com', '-a.com', '[::1]', 'evil.com@127.0.0.1']) assert.equal(DOMAIN_RE.test(d), false, d);
  const blocked = await new Promise((resolve) => safeLookup('localhost', {}, (err) => resolve(err)));
  assert.equal(blocked?.code, 'EBLOCKED', 'names that resolve to loopback are refused');
  assert.equal((await client().get('/favicons/facebook.com')).status, 401);
  for (const d of ['localhost', '127.0.0.1', 'x', encodeURIComponent('evil.com/../x'), 'intranet']) assert.equal((await alice.get(`/favicons/${d}`)).status, 404, d);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await query("INSERT INTO favicons (domain, content_type, data, found) VALUES ('cached.example.com', 'image/png', $1, true), ('missing.example.com', NULL, NULL, false)", [png]);
  const hit = await alice.get('/favicons/www.cached.example.com');
  assert.equal(hit.status, 200); assert.equal(hit.type, 'image/png');
  assert.match((await fetch(`${base}/favicons/cached.example.com`, { headers: { Cookie: alice.cookie } })).headers.get('content-security-policy'), /sandbox/);
  assert.equal((await alice.get('/favicons/missing.example.com')).status, 404, 'negative results are cached too');
});

// Keep this test LAST: it wipes the schema and restores it from the dump.
test('backup: admin-only ZIP with database.sql + img, and the SQL really restores everything', async () => {
  assert.equal((await client().post('/admin/backup')).status, 401);
  assert.equal((await alice.post('/admin/backup', undefined, reauth())).status, 403, 'members cannot export');
  const noPw = await admin.post('/admin/backup');
  assert.equal(noPw.status, 403); assert.equal(noPw.data.error.code, 'REAUTH_REQUIRED');
  const badPw = await admin.post('/admin/backup', undefined, reauth('not-the-password'));
  assert.equal(badPw.status, 403); assert.equal(badPw.data.error.code, 'REAUTH_FAILED');
  assert.ok((await admin.get('/admin/audit-logs?action=security.reauth_failed')).data.total >= 1, 'failed confirmations are audited');
  assert.equal((await admin.get('/admin/backup')).status, 404, 'no plain GET download any more');

  // organization data that must survive the round trip
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const o1 = (await alice.post('/organizations', { name: 'Backup Co', orgType: 'COMPANY', tags: ['x', 'y'], socialLinks: ['a.com/x'], foundedOn: '2001-02-03' })).data.organization;
  const o2 = (await alice.post('/organizations', { name: 'Backup Branch', orgType: 'GROUP' })).data.organization;
  const hp = (await alice.post('/peoples', { name: 'Backup Person' })).data.people;
  assert.equal((await alice.post('/org-links', { fromId: o2.id, toId: o1.id, linkType: 'SUB_UNIT_OF' })).status, 201);
  assert.equal((await alice.post('/memberships', { peopleId: hp.id, organizationId: o1.id, role: 'CEO' })).status, 201);
  assert.equal((await alice.put(`/organizations/${o1.id}/photo`, png, { 'Content-Type': 'image/png' })).status, 200);
  await alice.post('/posts', { organizationId: o1.id, title: 'Org post' });

  const zip = await admin.post('/admin/backup', undefined, RE);
  assert.equal(zip.status, 200);
  assert.equal(zip.type, 'application/zip');
  assert.equal(zip.data.subarray(0, 2).toString(), 'PK');
  const { ZipReader, Uint8ArrayReader, Uint8ArrayWriter, configure } = await import('@zip.js/zip.js');
  configure({ useWebWorkers: false });
  const entries = await new ZipReader(new Uint8ArrayReader(new Uint8Array(zip.data))).getEntries();
  const names = entries.map((e) => e.filename);
  for (const n of ['database.sql', 'manifest.json', 'README.txt']) assert.ok(names.includes(n), `zip contains ${n}`);
  assert.ok(names.some((n) => n.startsWith('img/people/people_')) && names.some((n) => n.startsWith('img/organization/organization_')), 'photos and logos are exported');
  assert.ok(entries.every((e) => e.encrypted), 'every entry is encrypted');
  const sqlEntry = entries.find((e) => e.filename === 'database.sql');
  await assert.rejects(sqlEntry.getData(new Uint8ArrayWriter(), { password: 'wrong' }), /password/i, 'a wrong password cannot open it');
  const sqlText = new TextDecoder().decode(await sqlEntry.getData(new Uint8ArrayWriter(), { password: PW }));
  assert.ok(sqlText.includes('INSERT INTO peoples') && sqlText.includes('BEGIN;'), 'the admin password opens it');
  assert.ok(!zip.data.toString('latin1').includes('INSERT INTO'), 'nothing is readable without the password');
  const res = await fetch(`${base}/admin/backup`, { method: 'POST', headers: { 'X-Requested-With': 'dataverse', Cookie: admin.cookie, ...RE } });
  assert.match(res.headers.get('content-disposition'), /dataverse-backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC\.zip/);
  await res.arrayBuffer();
  assert.ok((await admin.get('/admin/audit-logs?action=system.backup')).data.total >= 1);

  // restore test
  const counts = async () => Object.fromEntries(await Promise.all(['users', 'peoples', 'posts', 'caller_contacts', 'marriages', 'organizations', 'memberships', 'organization_links', 'organization_photos', 'people_photos', 'audit_logs']
    .map(async (t) => [t, (await query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n])));
  const before = await counts();
  const orgPosts = (await query('SELECT count(*)::int AS n FROM posts WHERE organization_id IS NOT NULL')).rows[0].n;
  const sample = (await query("SELECT id, name, tags, social_links, father_id, spouse_id, created_by, website FROM peoples WHERE name = 'Many Marriages'")).rows[0];
  const photo = (await query('SELECT people_id, md5(data) AS h FROM people_photos LIMIT 1')).rows[0];
  const links = (await query('SELECT * FROM organization_links ORDER BY id')).rows.length;
  const { dumpSql } = await import('../src/services/backupService.js');
  let sql = ''; for await (const chunk of dumpSql()) sql += chunk;

  await getPool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await getPool().query(migration);
  await getPool().query(sql);

  assert.deepEqual(await counts(), before);
  const again = (await query("SELECT id, name, tags, social_links, father_id, spouse_id, created_by, website FROM peoples WHERE name = 'Many Marriages'")).rows[0];
  assert.deepEqual(again, sample, 'a row with arrays, jsonb, relations and creator comes back identical');
  assert.equal((await query('SELECT md5(data) AS h FROM people_photos WHERE people_id = $1', [photo.people_id])).rows[0].h, photo.h, 'photo bytes identical');
  assert.equal((await query('SELECT count(*)::int AS n FROM organization_links')).rows[0].n, links);
  const o = (await query('SELECT name, org_type, tags, social_links, founded_on, phone_digits FROM organizations WHERE name = $1', ['Backup Co'])).rows[0];
  assert.deepEqual([o.org_type, o.tags, o.social_links, o.founded_on], ['COMPANY', ['x', 'y'], ['https://a.com/x'], '2001-02-03']);
  assert.equal((await query("SELECT role FROM memberships m JOIN peoples p ON p.id = m.people_id WHERE p.name = 'Backup Person'")).rows[0].role, 'CEO');
  assert.equal((await query("SELECT count(*)::int AS n FROM posts WHERE organization_id IS NOT NULL")).rows[0].n, orgPosts);
  assert.equal((await query("SELECT count(*)::int AS n FROM users WHERE reset_token_hash IS NOT NULL")).rows[0].n, 0, 'reset tokens are not exported');
  // identity sequences continue after the restored data
  const next = await query("INSERT INTO peoples (name) VALUES ('after restore') RETURNING id");
  assert.ok(next.rows[0].id > Math.max(...(await query('SELECT id FROM peoples WHERE name <> $1', ['after restore'])).rows.map((r) => r.id)));
});
