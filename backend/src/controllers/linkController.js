import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { escapeLike } from '../utils/phone.js';
import { query } from '../db/pool.js';
import { SUMMARY_COLUMNS, toSummary, canEditProfile } from '../services/profileService.js';
import { ORG_SUMMARY_COLUMNS, toOrgSummary, canEditOrg } from '../services/orgService.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';

const isAdmin = (u) => u.role === 'ADMIN';
const MAX_ITEMS = 300;

async function contributionsAllowed(user) {
  if (!isAdmin(user) && !(await getSettings()).allow_user_contributions) throw forbidden('Adding connections is limited to administrators right now');
}
const humanRow = async (id) => {
  const { rows } = await query('SELECT id, name, created_by FROM profiles WHERE id = $1', [id]);
  if (!rows.length) throw notFound(`Person ${id} not found`);
  return rows[0];
};
const orgRow = async (id) => {
  const { rows } = await query('SELECT id, name, created_by FROM organizations WHERE id = $1', [id]);
  if (!rows.length) throw notFound(`Organization ${id} not found`);
  return rows[0];
};
const extras = (b) => [b.role ?? null, b.startedOn ?? null, b.endedOn ?? null, b.note ?? null];

// ---------------------------------------------------------------- memberships (human <-> organization)
const membershipOut = (r, user) => ({
  id: r.membership_id, relation: r.relation, role: r.role, startedOn: r.started_on, endedOn: r.ended_on, note: r.note,
  canManage: isAdmin(user) || r.m_created_by === user.id || canEditProfile(user, { id: r.human_id, created_by: r.h_created_by }) || canEditOrg(user, { created_by: r.o_created_by }),
});

/** The organizations a person belongs to / is affiliated with. */
export const forHuman = asyncHandler(async (req, res) => {
  const id = req.valid.params.id;
  await humanRow(id);
  const { rows } = await query(
    `SELECT m.id AS membership_id, m.relation, m.role, m.started_on, m.ended_on, m.note, m.human_id, m.created_by AS m_created_by,
            h.created_by AS h_created_by, o.created_by AS o_created_by, ${ORG_SUMMARY_COLUMNS}
       FROM memberships m JOIN organizations o ON o.id = m.organization_id JOIN profiles h ON h.id = m.human_id
      WHERE m.human_id = $1 ORDER BY m.relation, lower(o.name), m.id`, [id]);
  res.json({ items: rows.map((r) => ({ ...membershipOut(r, req.user), organization: toOrgSummary(r) })) });
});

/** The people connected to an organization (paged, searchable). */
export const members = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const { q, page, limit } = req.valid.query;
  await orgRow(id);
  const params = [id];
  let where = 'm.organization_id = $1';
  if (q) { params.push(`%${escapeLike(q)}%`); where += ` AND (p.name ILIKE $2 OR p.nickname ILIKE $2 OR m.role ILIKE $2)`; }
  params.push(limit, (page - 1) * limit);
  const { rows } = await query(
    `SELECT count(*) OVER() AS total, m.id AS membership_id, m.relation, m.role, m.started_on, m.ended_on, m.note, m.human_id, m.created_by AS m_created_by,
            p.created_by AS h_created_by, o.created_by AS o_created_by, ${SUMMARY_COLUMNS}
       FROM memberships m JOIN profiles p ON p.id = m.human_id JOIN organizations o ON o.id = m.organization_id
      WHERE ${where} ORDER BY (m.relation = 'MEMBER') DESC, lower(p.name), m.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = rows[0]?.total ?? 0;
  res.json({ items: rows.map((r) => ({ ...membershipOut(r, req.user), human: toSummary(r) })), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const createMembership = asyncHandler(async (req, res) => {
  const b = req.valid.body;
  await contributionsAllowed(req.user);
  const [h, o] = [await humanRow(b.humanId), await orgRow(b.organizationId)];
  if (!isAdmin(req.user) && !canEditProfile(req.user, h) && !canEditOrg(req.user, o)) throw forbidden('You can only connect a person or organization you can edit');
  let row;
  try {
    ({ rows: [row] } = await query(
      `INSERT INTO memberships (human_id, organization_id, relation, role, started_on, ended_on, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.humanId, b.organizationId, b.relation, ...extras(b), req.user.id]));
  } catch (e) {
    if (e.constraint === 'memberships_unique_key') throw conflict('This person is already connected to that organization in this way');
    throw e;
  }
  await audit(req, 'membership.create', { entityType: 'membership', entityId: row.id, summary: `${h.name} → ${o.name} (${b.relation})`, details: { humanId: h.id, organizationId: o.id } });
  res.status(201).json({ id: row.id });
});

async function loadMembership(req) {
  const { rows } = await query(
    `SELECT m.*, h.created_by AS h_created_by, o.created_by AS o_created_by, h.name AS hname, o.name AS oname FROM memberships m
       JOIN profiles h ON h.id = m.human_id JOIN organizations o ON o.id = m.organization_id WHERE m.id = $1`, [req.valid.params.id]);
  const r = rows[0];
  if (!r) throw notFound('Connection not found');
  if (!(isAdmin(req.user) || r.created_by === req.user.id || canEditProfile(req.user, { id: r.human_id, created_by: r.h_created_by }) || canEditOrg(req.user, { created_by: r.o_created_by }))) throw forbidden('You cannot change this connection');
  return r;
}
async function patchExtras(table, r, b, req, action) {
  const ended = b.endedOn !== undefined ? b.endedOn : r.ended_on;
  const started = b.startedOn !== undefined ? b.startedOn : r.started_on;
  if (started && ended && ended < started) throw badRequest('The end date is before the start date', { endedOn: 'Cannot be before the start date' });
  await query(
    `UPDATE ${table} SET role = CASE WHEN $2 THEN $3 ELSE role END, started_on = CASE WHEN $4 THEN $5 ELSE started_on END,
            ended_on = CASE WHEN $6 THEN $7 ELSE ended_on END, note = CASE WHEN $8 THEN $9 ELSE note END WHERE id = $1`,
    [r.id, b.role !== undefined, b.role ?? null, b.startedOn !== undefined, b.startedOn ?? null, b.endedOn !== undefined, b.endedOn ?? null, b.note !== undefined, b.note ?? null]);
  await audit(req, action, { entityType: table, entityId: r.id, summary: `Updated connection ${r.id}`, details: { fields: Object.keys(b) } });
}
export const updateMembership = asyncHandler(async (req, res) => { const r = await loadMembership(req); await patchExtras('memberships', r, req.valid.body, req, 'membership.update'); res.json({ ok: true }); });
export const removeMembership = asyncHandler(async (req, res) => {
  const r = await loadMembership(req);
  await query('DELETE FROM memberships WHERE id = $1', [r.id]);
  await audit(req, 'membership.delete', { entityType: 'membership', entityId: r.id, summary: `Removed ${r.hname} ↔ ${r.oname}` });
  res.status(204).end();
});

// ---------------------------------------------------------------- organization <-> organization
const orgLinkOut = (r, selfId, user, selfRow) => ({
  id: r.link_id, linkType: r.link_type, direction: r.from_id === selfId ? 'out' : 'in', other: toOrgSummary(r),
  role: r.role, startedOn: r.started_on, endedOn: r.ended_on, note: r.note,
  canManage: isAdmin(user) || r.l_created_by === user.id || canEditOrg(user, selfRow) || canEditOrg(user, { created_by: r.other_created_by }),
});

/** Parents, sub-units, affiliations and connections of an organization, plus member counts. */
export const relations = asyncHandler(async (req, res) => {
  const id = req.valid.params.id;
  const self = await orgRow(id);
  const { rows } = await query(
    `SELECT l.*, l.id AS link_id, l.created_by AS l_created_by, o.created_by AS other_created_by, ${ORG_SUMMARY_COLUMNS}
       FROM organization_links l JOIN organizations o ON o.id = CASE WHEN l.from_id = $1 THEN l.to_id ELSE l.from_id END
      WHERE l.from_id = $1 OR l.to_id = $1 ORDER BY l.link_type, lower(o.name), l.id LIMIT ${MAX_ITEMS + 1}`, [id]);
  const counts = await query(
    `SELECT (SELECT count(*)::int FROM memberships WHERE organization_id = $1) AS members,
            (SELECT count(*)::int FROM organization_links WHERE to_id = $1 AND link_type = 'SUB_UNIT_OF') AS subs`, [id]);
  res.json({ items: rows.slice(0, MAX_ITEMS).map((r) => orgLinkOut(r, id, req.user, self)), truncated: rows.length > MAX_ITEMS, memberCount: counts.rows[0].members, subUnitCount: counts.rows[0].subs });
});

async function assertOrgLinkValid(b) {
  if (b.linkType === 'SUB_UNIT_OF') {
    const { rows } = await query(
      `WITH RECURSIVE d AS (
         SELECT from_id AS id FROM organization_links WHERE to_id = $1 AND link_type = 'SUB_UNIT_OF'
         UNION SELECT l.from_id FROM organization_links l JOIN d ON l.to_id = d.id WHERE l.link_type = 'SUB_UNIT_OF'
       ) SELECT 1 FROM d WHERE id = $2 LIMIT 1`, [b.fromId, b.toId]);
    if (rows.length) throw conflict('That would put an organization inside its own sub-units (a loop)', { toId: 'Would create a loop' });
  }
  if (b.linkType === 'AFFILIATED_WITH' || b.linkType === 'CONNECTED_TO') {
    const { rows } = await query('SELECT 1 FROM organization_links WHERE from_id = $1 AND to_id = $2 AND link_type = $3', [b.toId, b.fromId, b.linkType]);
    if (rows.length) throw conflict('These two organizations are already connected', { toId: 'Already connected' });
  }
}
export const createOrgLink = asyncHandler(async (req, res) => {
  const b = req.valid.body;
  await contributionsAllowed(req.user);
  if (b.fromId === b.toId) throw badRequest('An organization cannot be linked to itself', { toId: 'Pick a different organization' });
  const [from, to] = [await orgRow(b.fromId), await orgRow(b.toId)];
  if (!isAdmin(req.user) && !canEditOrg(req.user, from) && !canEditOrg(req.user, to)) throw forbidden('You can only connect organizations you can edit (one of the two must be yours)');
  await assertOrgLinkValid(b);
  let row;
  try {
    ({ rows: [row] } = await query(
      `INSERT INTO organization_links (from_id, to_id, link_type, role, started_on, ended_on, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.fromId, b.toId, b.linkType, ...extras(b), req.user.id]));
  } catch (e) {
    if (e.constraint === 'organization_links_unique_key') throw conflict('These two are already connected in this way');
    throw e;
  }
  await audit(req, 'orglink.create', { entityType: 'organization_link', entityId: row.id, summary: `Linked "${from.name}" → "${to.name}" (${b.linkType})`, details: { linkType: b.linkType } });
  res.status(201).json({ id: row.id });
});
async function loadOrgLink(req) {
  const { rows } = await query(
    `SELECT l.*, f.created_by AS fc, t.created_by AS tc FROM organization_links l JOIN organizations f ON f.id = l.from_id JOIN organizations t ON t.id = l.to_id WHERE l.id = $1`, [req.valid.params.id]);
  const r = rows[0];
  if (!r) throw notFound('Connection not found');
  if (!(isAdmin(req.user) || r.created_by === req.user.id || canEditOrg(req.user, { created_by: r.fc }) || canEditOrg(req.user, { created_by: r.tc }))) throw forbidden('You cannot change this connection');
  return r;
}
export const updateOrgLink = asyncHandler(async (req, res) => { const r = await loadOrgLink(req); await patchExtras('organization_links', r, req.valid.body, req, 'orglink.update'); res.json({ ok: true }); });
export const removeOrgLink = asyncHandler(async (req, res) => {
  const r = await loadOrgLink(req);
  await query('DELETE FROM organization_links WHERE id = $1', [r.id]);
  await audit(req, 'orglink.delete', { entityType: 'organization_link', entityId: r.id, summary: `Removed organization link ${r.id} (${r.link_type})` });
  res.status(204).end();
});

/** Any organization can be the root: its sub-units (recursively), with member counts. */
export const structure = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const { depth } = req.valid.query;
  await orgRow(id);
  const { rows: tree } = await query(
    `WITH RECURSIVE t AS (
       SELECT id, 0 AS depth, NULL::int AS parent FROM organizations WHERE id = $1
       UNION ALL
       SELECT l.from_id, t.depth + 1, l.to_id FROM organization_links l JOIN t ON l.to_id = t.id WHERE l.link_type = 'SUB_UNIT_OF' AND t.depth < $2
     ) SELECT DISTINCT ON (id) id, depth, parent FROM t ORDER BY id, depth LIMIT 500`, [id, depth]);
  const ids = tree.map((r) => r.id);
  const [orgs, mem, subs] = await Promise.all([
    query(`SELECT ${ORG_SUMMARY_COLUMNS} FROM organizations o WHERE o.id = ANY($1::int[])`, [ids]),
    query(`SELECT organization_id AS id, count(*)::int AS n FROM memberships WHERE organization_id = ANY($1::int[]) GROUP BY organization_id`, [ids]),
    query(`SELECT to_id AS id, count(*)::int AS n FROM organization_links WHERE link_type = 'SUB_UNIT_OF' AND to_id = ANY($1::int[]) GROUP BY to_id`, [ids]),
  ]);
  const nodes = new Map(orgs.rows.map((r) => [r.id, { ...toOrgSummary(r), memberCount: 0, subUnitCount: 0, children: [] }]));
  for (const m of mem.rows) nodes.get(m.id).memberCount = m.n;
  for (const s of subs.rows) nodes.get(s.id).subUnitCount = s.n;
  for (const t of tree) if (t.parent != null && nodes.has(t.parent)) nodes.get(t.parent).children.push(nodes.get(t.id));
  for (const n of nodes.values()) n.children.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ root: nodes.get(id), truncated: tree.length >= 500 });
});
