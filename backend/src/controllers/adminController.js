import { query, withTransaction } from '../db/pool.js';
import { config } from '../config.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError, badRequest, conflict, notFound } from '../utils/httpError.js';
import { escapeLike } from '../utils/phone.js';
import { hashPassword, generateTemporaryPassword } from '../utils/password.js';
import { serializeUser } from '../services/userService.js';
import { audit } from '../services/audit.js';
import { getSettings, updateSettings, DEFAULTS } from '../services/settings.js';
import { writeBackup, backupFileName } from '../services/backupService.js';

const USER_SELECT = `SELECT u.id, u.email, u.username, u.display_name, u.role, u.is_active, u.must_change_password, u.profile_id,
  u.theme, u.preferences, u.last_login_at, u.created_at, u.approval_status, p.name AS profile_name
  FROM users u LEFT JOIN profiles p ON p.id = u.profile_id`;

async function activeAdminCount(client = { query }, excludingId = null) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND is_active AND ($1::uuid IS NULL OR id <> $1)`, [excludingId]);
  return rows[0].n;
}

// ---------------------------------------------------------------- users
export const listUsers = asyncHandler(async (req, res) => {
  const { q, role, status, approval, page, limit } = req.valid.query;
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (q) where.push(`(u.display_name ILIKE ${p(`%${escapeLike(q)}%`)} OR u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  if (role) where.push(`u.role = ${p(role)}`);
  if (status) where.push(`u.is_active = ${p(status === 'active')}`);
  if (approval) where.push(`u.approval_status = ${p(approval.toUpperCase())}`);
  const { rows } = await query(
    `${USER_SELECT.replace('SELECT u.id,', 'SELECT count(*) OVER() AS total, u.id,')}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.created_at DESC, u.id LIMIT ${p(limit)} OFFSET ${p((page - 1) * limit)}`, params);
  const total = rows[0]?.total ?? 0;
  res.json({ items: rows.map(serializeUser), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const getUser = asyncHandler(async (req, res) => {
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [req.valid.params.id]);
  if (!rows.length) throw notFound('User not found');
  res.json({ user: serializeUser(rows[0]) });
});

async function assertProfileExists(id) {
  if (id == null) return;
  const { rows } = await query('SELECT 1 FROM profiles WHERE id = $1', [id]);
  if (!rows.length) throw badRequest(`Profile ${id} does not exist`, { profileId: 'No profile with this ID' });
}

export const createUser = asyncHandler(async (req, res) => {
  const b = req.valid.body;
  await assertProfileExists(b.profileId);
  const temporaryPassword = b.password ? null : generateTemporaryPassword();
  const hash = await hashPassword(b.password || temporaryPassword);
  const { rows } = await query(
    `INSERT INTO users (email, username, display_name, password_hash, role, profile_id, must_change_password, approval_status, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED',$8,now()) RETURNING id`,
    [b.email, b.username, b.displayName, hash, b.role, b.profileId ?? null, b.mustChangePassword, req.user.id]);
  await audit(req, 'user.create', { entityType: 'user', entityId: rows[0].id, summary: `Created ${b.role} account ${b.email}`, details: { role: b.role, email: b.email } });
  const user = (await query(`${USER_SELECT} WHERE u.id = $1`, [rows[0].id])).rows[0];
  // The generated password is returned exactly once and is never stored or logged in clear text.
  res.status(201).json({ user: serializeUser(user), temporaryPassword });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const b = req.valid.body;
  const before = (await query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
  if (!before) throw notFound('User not found');
  const isSelf = id === req.user.id;

  const demoting = b.role === 'USER' && before.role === 'ADMIN';
  const deactivating = b.isActive === false && before.is_active;
  if (isSelf && (demoting || deactivating)) throw conflict('You cannot demote or deactivate your own account');
  if ((demoting || deactivating) && before.role === 'ADMIN' && (await activeAdminCount(undefined, id)) === 0) {
    throw conflict('At least one active administrator must remain');
  }
  await assertProfileExists(b.profileId);

  const sets = [];
  const vals = [id];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.displayName !== undefined) add('display_name', b.displayName);
  if (b.username !== undefined) add('username', b.username);
  if (b.email !== undefined) add('email', b.email);
  if (b.role !== undefined) add('role', b.role);
  if (b.isActive !== undefined) add('is_active', b.isActive);
  if (b.profileId !== undefined) add('profile_id', b.profileId);
  // role / status changes invalidate that user's existing sessions
  if (b.role !== undefined && b.role !== before.role || deactivating) sets.push('token_version = token_version + 1');
  if (sets.length) await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, vals);

  if (b.role !== undefined && b.role !== before.role) {
    await audit(req, 'user.role_change', { entityType: 'user', entityId: id, summary: `Changed role of ${before.email}: ${before.role} → ${b.role}`, details: { from: before.role, to: b.role } });
  }
  if (b.isActive !== undefined && b.isActive !== before.is_active) {
    await audit(req, b.isActive ? 'user.activate' : 'user.deactivate', { entityType: 'user', entityId: id, summary: `${b.isActive ? 'Activated' : 'Deactivated'} ${before.email}` });
  }
  const otherKeys = Object.keys(b).filter((k) => !['role', 'isActive'].includes(k));
  if (otherKeys.length) await audit(req, 'user.update', { entityType: 'user', entityId: id, summary: `Updated account ${before.email}`, details: { fields: otherKeys } });

  const user = (await query(`${USER_SELECT} WHERE u.id = $1`, [id])).rows[0];
  res.json({ user: serializeUser(user) });
});

// ---------------------------------------------------------------- sign-up approval
async function decide(req, res, next, decision) {
  const { id } = req.valid.params;
  if (id === req.user.id) throw conflict('You cannot change the approval status of your own account');
  const before = (await query('SELECT id, email, role, approval_status FROM users WHERE id = $1', [id])).rows[0];
  if (!before) throw notFound('User not found');
  if (before.approval_status === decision) return res.json({ user: serializeUser((await query(`${USER_SELECT} WHERE u.id = $1`, [id])).rows[0]) });
  if (decision === 'REJECTED' && before.role === 'ADMIN' && (await activeAdminCount(undefined, id)) === 0) throw conflict('At least one active administrator must remain');
  // Rejecting also bumps token_version so any lingering session dies immediately.
  await query(
    `UPDATE users SET approval_status = $2, approved_by = $3, approved_at = now(),
            token_version = token_version + CASE WHEN $2 = 'APPROVED' THEN 0 ELSE 1 END WHERE id = $1`, [id, decision, req.user.id]);
  await audit(req, decision === 'APPROVED' ? 'user.approve' : 'user.reject', {
    entityType: 'user', entityId: id, summary: `${decision === 'APPROVED' ? 'Approved' : 'Rejected'} registration of ${before.email}`, details: { from: before.approval_status } });
  res.json({ user: serializeUser((await query(`${USER_SELECT} WHERE u.id = $1`, [id])).rows[0]) });
}
export const approveUser = asyncHandler((req, res, next) => decide(req, res, next, 'APPROVED'));
export const rejectUser = asyncHandler((req, res, next) => decide(req, res, next, 'REJECTED'));

export const resetUserPassword = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const target = (await query('SELECT id, email FROM users WHERE id = $1', [id])).rows[0];
  if (!target) throw notFound('User not found');
  const temporaryPassword = req.valid.body.password ? null : generateTemporaryPassword();
  const hash = await hashPassword(req.valid.body.password || temporaryPassword);
  await query(
    `UPDATE users SET password_hash = $2, must_change_password = true, token_version = token_version + 1,
            reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $1`, [id, hash]);
  await audit(req, 'user.password_reset', { entityType: 'user', entityId: id, summary: `Reset password for ${target.email}` });
  res.json({ temporaryPassword, mustChangePassword: true });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  if (id === req.user.id) throw conflict('You cannot delete your own account');
  const target = await withTransaction(async (client) => {
    const row = (await client.query('SELECT id, email, role, is_active FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw notFound('User not found');
    if (row.role === 'ADMIN' && row.is_active && (await activeAdminCount(client, id)) === 0) throw conflict('At least one active administrator must remain');
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    return row;
  });
  // NOTE: never use the pooled query()/audit() inside withTransaction - with a pool of 1 (serverless) it would deadlock.
  await audit(req, 'user.delete', { entityType: 'user', entityId: id, summary: `Deleted account ${target.email}`, details: { role: target.role } });
  res.status(204).end();
});

// ---------------------------------------------------------------- site settings
export const getSiteSettings = asyncHandler(async (_req, res) => res.json({ settings: await getSettings({ fresh: true }), defaults: DEFAULTS }));

export const putSiteSettings = asyncHandler(async (req, res) => {
  const { settings, changes } = await updateSettings(req.valid.body, req.user.id);
  if (Object.keys(changes).length) {
    await audit(req, 'settings.update', { entityType: 'settings', summary: `Changed site settings: ${Object.keys(changes).join(', ')}`, details: changes });
  }
  res.json({ settings });
});

// ---------------------------------------------------------------- audit log
export const listAudit = asyncHandler(async (req, res) => {
  const { action, actor, q, page, limit } = req.valid.query;
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (action) where.push(`a.action = ${p(action)}`);
  if (actor) where.push(`a.actor_id = ${p(actor)}`);
  if (q) where.push(`(a.summary ILIKE ${p(`%${escapeLike(q)}%`)} OR a.actor_label ILIKE $${params.length})`);
  const { rows } = await query(
    `SELECT count(*) OVER() AS total, a.id, a.actor_id, a.actor_label, a.action, a.entity_type, a.entity_id, a.summary, a.details, a.ip, a.created_at
       FROM audit_logs a ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC, a.id DESC LIMIT ${p(limit)} OFFSET ${p((page - 1) * limit)}`, params);
  const total = rows[0]?.total ?? 0;
  res.json({
    items: rows.map((r) => ({ id: r.id, actorId: r.actor_id, actor: r.actor_label, action: r.action, entityType: r.entity_type, entityId: r.entity_id, summary: r.summary, details: r.details, ip: r.ip, createdAt: r.created_at })),
    total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const auditActions = asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT action, count(*)::int AS count FROM audit_logs GROUP BY action ORDER BY action');
  res.json({ items: rows });
});

// ---------------------------------------------------------------- stats & system
export const stats = asyncHandler(async (_req, res) => {
  const [totals, daily, recentUsers, recentAudit] = await Promise.all([
    query(`SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM users WHERE role = 'ADMIN')::int AS admins,
      (SELECT count(*) FROM users WHERE NOT is_active)::int AS inactive_users,
      (SELECT count(*) FROM users WHERE approval_status = 'PENDING')::int AS pending_users,
      (SELECT count(*) FROM profiles)::int AS profiles,
      (SELECT count(*) FROM organizations)::int AS organizations,
      (SELECT count(*) FROM profiles WHERE photo_updated_at IS NOT NULL)::int AS profiles_with_photo,
      (SELECT count(*) FROM profiles WHERE father_id IS NOT NULL OR mother_id IS NOT NULL)::int AS profiles_with_parents,
      (SELECT count(*) FROM profiles WHERE spouse_id IS NOT NULL)::int AS married,
      (SELECT count(*) FROM caller_contacts)::int AS contacts,
      (SELECT count(DISTINCT number_digits) FROM caller_contacts)::int AS unique_numbers,
      (SELECT count(*) FROM caller_contacts WHERE profile_id IS NOT NULL)::int AS linked_contacts,
      (SELECT count(*) FROM posts)::int AS posts,
      (SELECT count(*) FROM audit_logs)::int AS audit_events`),
    query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
        (SELECT count(*) FROM users WHERE created_at::date = d::date)::int AS users,
        (SELECT count(*) FROM profiles WHERE created_at::date = d::date)::int AS profiles,
        (SELECT count(*) FROM caller_contacts WHERE created_at::date = d::date)::int AS contacts
       FROM generate_series(current_date - 13, current_date, interval '1 day') AS d ORDER BY d`),
    query(`SELECT id, display_name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5`),
    query(`SELECT id, actor_label, action, summary, created_at FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 8`),
  ]);
  const t = totals.rows[0];
  res.json({
    totals: {
      users: t.users, admins: t.admins, inactiveUsers: t.inactive_users, pendingUsers: t.pending_users, profiles: t.profiles, organizations: t.organizations, profilesWithPhoto: t.profiles_with_photo,
      profilesWithParents: t.profiles_with_parents, married: t.married, contacts: t.contacts, uniqueNumbers: t.unique_numbers,
      linkedContacts: t.linked_contacts, posts: t.posts, auditEvents: t.audit_events,
    },
    daily: daily.rows,
    recentUsers: recentUsers.rows.map((u) => ({ id: u.id, displayName: u.display_name, email: u.email, role: u.role, createdAt: u.created_at })),
    recentActivity: recentAudit.rows.map((a) => ({ id: a.id, actor: a.actor_label, action: a.action, summary: a.summary, createdAt: a.created_at })),
  });
});

export const system = asyncHandler(async (_req, res) => {
  const [v, size, tables, mig] = await Promise.all([
    query('SELECT version() AS v'),
    query('SELECT pg_database_size(current_database())::bigint AS bytes'),
    query(`SELECT relname AS name, n_live_tup::bigint AS rows, pg_total_relation_size(relid)::bigint AS bytes
             FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`),
    query('SELECT name, applied_at FROM schema_migrations ORDER BY name').catch(() => ({ rows: [] })),
  ]);
  res.json({
    runtime: { node: process.version, environment: config.env, serverless: config.isServerless, uptimeSeconds: Math.round(process.uptime()), uptimeNote: config.isServerless ? 'Per function instance' : undefined },
    database: { version: v.rows[0].v.split(' on ')[0], sizeBytes: size.rows[0].bytes, tables: tables.rows.map((t) => ({ name: t.name, rows: t.rows, bytes: t.bytes })), migrations: mig.rows },
    config: { mailConfigured: Boolean(config.mail.resendApiKey), corsOrigins: config.cors.origins, siteUrl: config.siteUrl, poolMax: config.db.poolMax },
  });
});

// ---------------------------------------------------------------- backup
export const downloadBackup = asyncHandler(async (req, res) => {
  if (config.isServerless) {
    // Serverless hosts cap duration and response size (Netlify: 10 s / 6 MB), so a big export cannot complete there.
    // Measure the app's own table data (not pg_database_size, which includes system catalogs and is several MB even when empty).
    const { rows } = await query(
      `SELECT COALESCE(sum(pg_table_size(c.oid)), 0)::bigint AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`);
    if (rows[0].bytes > 4 * 1024 * 1024) throw new HttpError(413, 'This database is too large to download through the serverless host. Run "npm run backup" on your computer instead.', { code: 'BACKUP_TOO_LARGE' });
  }
  const name = backupFileName();
  await audit(req, 'system.backup', { entityType: 'system', summary: `Exported a full backup (${name})` });
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  try { await writeBackup(res); } catch (err) { console.error('[backup] failed:', err.message); res.destroy(err); }
});
