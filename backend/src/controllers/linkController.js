import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { query } from '../db/pool.js';
import { SUMMARY_COLUMNS, toSummary, canEditProfile } from '../services/profileService.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';

const isAdmin = (u) => u.role === 'ADMIN';
const MAX_ITEMS = 300;

const linkOut = (r, selfId, user, selfRow) => ({
  id: r.link_id,
  linkType: r.link_type,
  direction: r.from_id === selfId ? 'out' : 'in', // out: this profile -> other; in: other -> this profile
  other: toSummary(r),
  role: r.role,
  startedOn: r.started_on,
  endedOn: r.ended_on,
  note: r.note,
  canManage: isAdmin(user) || r.created_by === user.id || canEditProfile(user, selfRow) || canEditProfile(user, { id: r.id_other, created_by: r.other_created_by }),
});

async function profileRow(id) {
  const { rows } = await query('SELECT id, name, entity_type, created_by FROM profiles WHERE id = $1', [id]);
  if (!rows.length) throw notFound(`Profile ${id} not found`);
  return rows[0];
}

/** All links of one profile, both directions (memberships, sub-units, affiliations, connections). */
export const listForProfile = asyncHandler(async (req, res) => {
  const id = req.valid.params.id;
  const self = await profileRow(id);
  const { rows } = await query(
    `SELECT l.*, l.id AS link_id, p.id AS id_other, p.created_by AS other_created_by, ${SUMMARY_COLUMNS}
       FROM entity_links l JOIN profiles p ON p.id = CASE WHEN l.from_id = $1 THEN l.to_id ELSE l.from_id END
      WHERE l.from_id = $1 OR l.to_id = $1 ORDER BY l.link_type, lower(p.name), l.id LIMIT ${MAX_ITEMS + 1}`, [id]);
  const counts = await query(
    `SELECT link_type, count(*)::int AS n FROM entity_links WHERE to_id = $1 AND link_type IN ('MEMBER_OF', 'SUB_UNIT_OF') GROUP BY link_type`, [id]);
  res.json({
    items: rows.slice(0, MAX_ITEMS).map((r) => linkOut(r, id, req.user, self)),
    truncated: rows.length > MAX_ITEMS,
    memberCount: counts.rows.find((c) => c.link_type === 'MEMBER_OF')?.n ?? 0,
    subUnitCount: counts.rows.find((c) => c.link_type === 'SUB_UNIT_OF')?.n ?? 0,
  });
});

async function assertValid(b, from, to) {
  if (b.linkType === 'MEMBER_OF' && to.entity_type === 'HUMAN') throw badRequest('Only groups, organizations, parties or other entities can have members', { toId: 'Pick a non-person entity' });
  if (b.linkType === 'SUB_UNIT_OF') {
    if (from.entity_type === 'HUMAN' || to.entity_type === 'HUMAN') throw badRequest('Sub-units connect groups, organizations, parties or other entities, not people', { toId: 'Pick a non-person entity' });
    const { rows } = await query(
      `WITH RECURSIVE d AS (
         SELECT from_id AS id FROM entity_links WHERE to_id = $1 AND link_type = 'SUB_UNIT_OF'
         UNION SELECT l.from_id FROM entity_links l JOIN d ON l.to_id = d.id WHERE l.link_type = 'SUB_UNIT_OF'
       ) SELECT 1 FROM d WHERE id = $2 LIMIT 1`, [b.fromId, b.toId]);
    if (rows.length) throw conflict('That would put an entity inside its own sub-units (a loop)', { toId: 'Would create a loop' });
  }
  if (b.linkType === 'AFFILIATED_WITH' || b.linkType === 'CONNECTED_TO') {
    const { rows } = await query('SELECT 1 FROM entity_links WHERE from_id = $1 AND to_id = $2 AND link_type = $3', [b.toId, b.fromId, b.linkType]);
    if (rows.length) throw conflict('These two are already connected', { toId: 'Already connected' });
  }
}

export const create = asyncHandler(async (req, res) => {
  const b = req.valid.body;
  if (!isAdmin(req.user) && !(await getSettings()).allow_user_contributions) throw forbidden('Adding connections is limited to administrators right now');
  const [from, to] = [await profileRow(b.fromId), await profileRow(b.toId)];
  if (!isAdmin(req.user) && !canEditProfile(req.user, from) && !canEditProfile(req.user, to)) throw forbidden('You can only connect profiles you can edit (one of the two must be yours)');
  await assertValid(b, from, to);
  let row;
  try {
    ({ rows: [row] } = await query(
      `INSERT INTO entity_links (from_id, to_id, link_type, role, started_on, ended_on, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.fromId, b.toId, b.linkType, b.role ?? null, b.startedOn ?? null, b.endedOn ?? null, b.note ?? null, req.user.id]));
  } catch (e) {
    if (e.constraint === 'entity_links_unique_key') throw conflict('These two are already connected in this way');
    throw e;
  }
  await audit(req, 'link.create', { entityType: 'link', entityId: row.id, summary: `Linked "${from.name}" → "${to.name}" (${b.linkType})`, details: { linkType: b.linkType, fromId: b.fromId, toId: b.toId } });
  res.status(201).json({ id: row.id });
});

async function loadManageable(req) {
  const { rows } = await query(
    `SELECT l.*, f.created_by AS from_creator, f.id AS fid, t.created_by AS to_creator, t.id AS tid FROM entity_links l
       JOIN profiles f ON f.id = l.from_id JOIN profiles t ON t.id = l.to_id WHERE l.id = $1`, [req.valid.params.id]);
  const r = rows[0];
  if (!r) throw notFound('Connection not found');
  const ok = isAdmin(req.user) || r.created_by === req.user.id || canEditProfile(req.user, { id: r.fid, created_by: r.from_creator }) || canEditProfile(req.user, { id: r.tid, created_by: r.to_creator });
  if (!ok) throw forbidden('You cannot change this connection');
  return r;
}

export const update = asyncHandler(async (req, res) => {
  const r = await loadManageable(req);
  const b = req.valid.body;
  const ended = b.endedOn !== undefined ? b.endedOn : r.ended_on;
  const started = b.startedOn !== undefined ? b.startedOn : r.started_on;
  if (started && ended && ended < started) throw badRequest('The end date is before the start date', { endedOn: 'Cannot be before the start date' });
  await query(
    `UPDATE entity_links SET role = CASE WHEN $2 THEN $3 ELSE role END, started_on = CASE WHEN $4 THEN $5 ELSE started_on END,
            ended_on = CASE WHEN $6 THEN $7 ELSE ended_on END, note = CASE WHEN $8 THEN $9 ELSE note END WHERE id = $1`,
    [r.id, b.role !== undefined, b.role ?? null, b.startedOn !== undefined, b.startedOn ?? null, b.endedOn !== undefined, b.endedOn ?? null, b.note !== undefined, b.note ?? null]);
  await audit(req, 'link.update', { entityType: 'link', entityId: r.id, summary: `Updated connection ${r.id}`, details: { fields: Object.keys(b) } });
  res.json({ ok: true });
});

export const remove = asyncHandler(async (req, res) => {
  const r = await loadManageable(req);
  await query('DELETE FROM entity_links WHERE id = $1', [r.id]);
  await audit(req, 'link.delete', { entityType: 'link', entityId: r.id, summary: `Removed connection ${r.id} (${r.link_type})`, details: { fromId: r.from_id, toId: r.to_id } });
  res.status(204).end();
});

/** Any entity can be the root: its sub-units (recursively), with member counts. */
export const structure = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const { depth } = req.valid.query;
  await profileRow(id);
  const { rows: tree } = await query(
    `WITH RECURSIVE t AS (
       SELECT id, 0 AS depth, NULL::int AS parent FROM profiles WHERE id = $1
       UNION ALL
       SELECT l.from_id, t.depth + 1, l.to_id FROM entity_links l JOIN t ON l.to_id = t.id WHERE l.link_type = 'SUB_UNIT_OF' AND t.depth < $2
     ) SELECT DISTINCT ON (id) id, depth, parent FROM t ORDER BY id, depth LIMIT 500`, [id, depth]);
  const ids = tree.map((r) => r.id);
  const [people, members, subs] = await Promise.all([
    query(`SELECT ${SUMMARY_COLUMNS} FROM profiles p WHERE p.id = ANY($1::int[])`, [ids]),
    query(`SELECT to_id AS id, count(*)::int AS n FROM entity_links WHERE link_type = 'MEMBER_OF' AND to_id = ANY($1::int[]) GROUP BY to_id`, [ids]),
    query(`SELECT to_id AS id, count(*)::int AS n FROM entity_links WHERE link_type = 'SUB_UNIT_OF' AND to_id = ANY($1::int[]) GROUP BY to_id`, [ids]),
  ]);
  const nodes = new Map(people.rows.map((r) => [r.id, { ...toSummary(r), memberCount: 0, subUnitCount: 0, children: [] }]));
  for (const m of members.rows) nodes.get(m.id).memberCount = m.n;
  for (const s of subs.rows) nodes.get(s.id).subUnitCount = s.n;
  for (const t of tree) if (t.parent != null && nodes.has(t.parent)) nodes.get(t.parent).children.push(nodes.get(t.id));
  for (const n of nodes.values()) n.children.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ root: nodes.get(id), truncated: tree.length >= 500 });
});
