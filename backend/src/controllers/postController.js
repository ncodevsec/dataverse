import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, notFound } from '../utils/httpError.js';
import { escapeLike } from '../utils/phone.js';
import { query } from '../db/pool.js';
import { canEditProfile } from '../services/profileService.js';
import { canEditOrg } from '../services/orgService.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';

const isAdmin = (u) => u.role === 'ADMIN';
const EXCERPT = 1200;

const SELECT = `SELECT po.id, po.profile_id, po.organization_id, po.title, po.content, po.status, po.tags, po.created_by, po.created_at, po.updated_at,
       u.display_name AS author_name,
       COALESCE(pr.name, og.name) AS subject_name, pr.gender AS subject_gender,
       COALESCE(pr.photo_updated_at, og.photo_updated_at) AS subject_photo,
       pr.created_by AS profile_created_by, og.created_by AS org_created_by
  FROM posts po
  LEFT JOIN profiles pr ON pr.id = po.profile_id
  LEFT JOIN organizations og ON og.id = po.organization_id
  LEFT JOIN users u ON u.id = po.created_by`;

const canManage = (user, r) => isAdmin(user) || r.created_by === user.id
  || (r.profile_id != null ? canEditProfile(user, { id: r.profile_id, created_by: r.profile_created_by }) : canEditOrg(user, { created_by: r.org_created_by }));

function out(r, user, { excerpt = false } = {}) {
  const truncated = excerpt && r.content.length > EXCERPT;
  const kind = r.profile_id != null ? 'human' : 'organization';
  const sid = r.profile_id ?? r.organization_id;
  return {
    id: r.id,
    title: r.title,
    content: truncated ? r.content.slice(0, EXCERPT) : r.content,
    truncated,
    status: r.status,
    tags: r.tags || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    author: r.created_by ? { id: r.created_by, name: r.author_name } : null,
    subject: { kind, id: sid, name: r.subject_name, gender: r.subject_gender ?? null,
      photoUrl: r.subject_photo ? `/api/${kind === 'human' ? 'profiles' : 'organizations'}/${sid}/photo?v=${new Date(r.subject_photo).getTime()}` : null },
    canManage: canManage(user, r),
  };
}

async function profileOr404(id) {
  const { rows } = await query('SELECT id, name, created_by FROM profiles WHERE id = $1', [id]);
  if (!rows.length) throw notFound('Profile not found');
  return rows[0];
}
async function orgOr404(id) {
  const { rows } = await query('SELECT id, name, created_by FROM organizations WHERE id = $1', [id]);
  if (!rows.length) throw notFound('Organization not found');
  return rows[0];
}

async function contributionsAllowed(user) {
  if (isAdmin(user)) return;
  if (!(await getSettings()).allow_user_contributions) throw forbidden('Posting is limited to administrators right now');
}

/** Feed: everyone's published posts, plus the viewer's own drafts/archived posts. */
export const feed = asyncHandler(async (req, res) => {
  const { q, tag, profileId, organizationId, mine, page, limit } = req.valid.query;
  const params = [req.user.id];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const where = [mine ? 'po.created_by = $1' : `(po.status = 'published' OR po.created_by = $1)`];
  if (tag) where.push(`${p(tag)} = ANY(po.tags)`);
  if (profileId) where.push(`po.profile_id = ${p(profileId)}`);
  if (organizationId) where.push(`po.organization_id = ${p(organizationId)}`);
  if (q) { const like = p(`%${escapeLike(q)}%`); where.push(`(po.title ILIKE ${like} OR po.content ILIKE ${like} OR COALESCE(pr.name, og.name) ILIKE ${like})`); }
  const { rows } = await query(
    `SELECT count(*) OVER() AS total, x.* FROM (${SELECT} WHERE ${where.join(' AND ')}) x
      ORDER BY x.created_at DESC, x.id DESC LIMIT ${p(limit)} OFFSET ${p((page - 1) * limit)}`, params);
  const total = rows[0]?.total ?? 0;
  res.json({ items: rows.map((r) => out(r, req.user, { excerpt: true })), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const tags = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT tag AS value, count(*)::int AS count FROM posts, unnest(tags) AS tag
      WHERE status = 'published' OR created_by = $1 GROUP BY tag ORDER BY count(*) DESC, tag LIMIT 60`, [req.user.id]);
  res.json({ items: rows });
});

export const get = asyncHandler(async (req, res) => {
  const { rows } = await query(`${SELECT} WHERE po.id = $1`, [req.valid.params.id]);
  const r = rows[0];
  if (!r || (r.status !== 'published' && !canManage(req.user, r))) throw notFound('Post not found');
  res.json({ post: out(r, req.user) });
});

export const listForProfile = asyncHandler(async (req, res) => {
  const profile = await profileOr404(req.valid.params.id);
  const manage = isAdmin(req.user) || canEditProfile(req.user, profile);
  const { rows } = await query(
    `${SELECT} WHERE po.profile_id = $1 AND (po.status = 'published' OR $2::boolean OR po.created_by = $3)
      ORDER BY po.created_at DESC, po.id DESC LIMIT 100`, [profile.id, manage, req.user.id]);
  res.json({ items: rows.map((r) => out(r, req.user, { excerpt: true })) });
});

export const listForOrganization = asyncHandler(async (req, res) => {
  const org = await orgOr404(req.valid.params.id);
  const manage = isAdmin(req.user) || canEditOrg(req.user, org);
  const { rows } = await query(
    `${SELECT} WHERE po.organization_id = $1 AND (po.status = 'published' OR $2::boolean OR po.created_by = $3)
      ORDER BY po.created_at DESC, po.id DESC LIMIT 100`, [org.id, manage, req.user.id]);
  res.json({ items: rows.map((r) => out(r, req.user, { excerpt: true })) });
});

async function insert(req, res, { profileId = null, organizationId = null }) {
  const subject = profileId != null ? await profileOr404(profileId) : await orgOr404(organizationId);
  await contributionsAllowed(req.user);
  const b = req.valid.body;
  const { rows } = await query(
    `INSERT INTO posts (profile_id, organization_id, title, content, status, tags, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [profileId, organizationId, b.title, b.content, b.status, b.tags ?? [], req.user.id]);
  await audit(req, 'post.create', { entityType: 'post', entityId: rows[0].id, summary: `Posted "${b.title}" on ${subject.name}`, details: { status: b.status } });
  const full = (await query(`${SELECT} WHERE po.id = $1`, [rows[0].id])).rows[0];
  res.status(201).json({ post: out(full, req.user) });
}
export const create = asyncHandler((req, res) => insert(req, res, { profileId: req.valid.body.profileId ?? null, organizationId: req.valid.body.organizationId ?? null }));
export const createForProfile = asyncHandler((req, res) => insert(req, res, { profileId: req.valid.params.id }));
export const createForOrganization = asyncHandler((req, res) => insert(req, res, { organizationId: req.valid.params.id }));

async function loadManageable(req) {
  const { rows } = await query(`${SELECT} WHERE po.id = $1`, [req.valid.params.id]);
  const r = rows[0];
  if (!r) throw notFound('Post not found');
  if (!canManage(req.user, r)) throw forbidden('You cannot change this post');
  return r;
}

export const update = asyncHandler(async (req, res) => {
  const post = await loadManageable(req);
  const b = req.valid.body;
  await query(
    `UPDATE posts SET title = COALESCE($2, title), content = COALESCE($3, content), status = COALESCE($4, status), tags = COALESCE($5, tags) WHERE id = $1`,
    [post.id, b.title ?? null, b.content ?? null, b.status ?? null, b.tags ?? null]);
  await audit(req, 'post.update', { entityType: 'post', entityId: post.id, summary: `Edited post "${post.title}"`, details: { fields: Object.keys(b) } });
  res.json({ post: out((await query(`${SELECT} WHERE po.id = $1`, [post.id])).rows[0], req.user) });
});

export const remove = asyncHandler(async (req, res) => {
  const post = await loadManageable(req);
  await query('DELETE FROM posts WHERE id = $1', [post.id]);
  await audit(req, 'post.delete', { entityType: 'post', entityId: post.id, summary: `Deleted post "${post.title}"` });
  res.status(204).end();
});
