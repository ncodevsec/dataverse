import { query } from '../db/pool.js';
import { notFound } from '../utils/httpError.js';
import { SUMMARY_COLUMNS, toSummary, getFamily } from './profileService.js';

const MAX_NODES = 600;

async function summariesByIds(ids) {
  if (!ids.length) return new Map();
  const { rows } = await query(`SELECT ${SUMMARY_COLUMNS} FROM profiles p WHERE p.id = ANY($1::int[])`, [ids]);
  return new Map(rows.map((r) => [r.id, toSummary(r)]));
}

/**
 * Everything the Shekor page needs for one person:
 *  - lineage:      paternal chain from the oldest known ancestor down to the person (the legacy "বংশানুক্রম")
 *  - ancestors:    pedigree (both parents) up to `up` generations
 *  - descendants:  children / grandchildren ... down to `down` generations, each with their spouse
 *  - family:       father, mother, spouse, siblings, children
 * All traversal happens inside PostgreSQL with depth limits, so a huge table never leaves the database.
 */
export async function getTree(id, { up = 3, down = 2 } = {}) {
  const focusRes = await query(`SELECT ${SUMMARY_COLUMNS} FROM profiles p WHERE p.id = $1`, [id]);
  if (!focusRes.rows.length) throw notFound('Profile not found');
  const focus = toSummary(focusRes.rows[0]);

  const [lineageRes, ancRes, descRes, family] = await Promise.all([
    query(
      `WITH RECURSIVE l AS (
         SELECT id, father_id, 0 AS depth FROM profiles WHERE id = $1
         UNION ALL
         SELECT p.id, p.father_id, l.depth + 1 FROM l JOIN profiles p ON p.id = l.father_id WHERE l.depth < 60
       ) SELECT id, depth FROM l ORDER BY depth DESC`, [id]),
    up > 0
      ? query(
        `WITH RECURSIVE a AS (
           SELECT id, father_id, mother_id, 0 AS depth FROM profiles WHERE id = $1
           UNION ALL
           SELECT p.id, p.father_id, p.mother_id, a.depth + 1
             FROM a JOIN profiles p ON p.id = a.father_id OR p.id = a.mother_id WHERE a.depth < $2
         ) SELECT DISTINCT id FROM a LIMIT ${MAX_NODES}`, [id, up])
      : { rows: [{ id }] },
    down > 0
      ? query(
        `WITH RECURSIVE d AS (
           SELECT id, 0 AS depth FROM profiles WHERE id = $1
           UNION
           SELECT c.id, d.depth + 1 FROM d JOIN profiles c ON c.father_id = d.id OR c.mother_id = d.id WHERE d.depth < $2
         ) SELECT DISTINCT id FROM d LIMIT ${MAX_NODES}`, [id, down])
      : { rows: [{ id }] },
    getFamily(id),
  ]);

  const lineageIds = lineageRes.rows.map((r) => r.id);
  const ancIds = ancRes.rows.map((r) => r.id);
  const descIds = descRes.rows.map((r) => r.id);

  // load every person once, plus spouses of descendants
  const wanted = new Set([...lineageIds, ...ancIds, ...descIds]);
  const first = await summariesByIds([...wanted]);
  const marriages = descIds.length
    ? (await query(`SELECT person_a, person_b, married_on, ended_on, end_reason FROM marriages WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[]) ORDER BY married_on NULLS LAST, id`, [descIds])).rows
    : [];
  const partnerOf = (m, pid) => (m.person_a === pid ? m.person_b : m.person_a);
  const spouseIds = marriages.flatMap((m) => [m.person_a, m.person_b]).filter((v) => !first.has(v));
  const people = new Map([...first, ...(await summariesByIds([...new Set(spouseIds)]))]);
  const spousesOf = (pid) => marriages.filter((m) => m.person_a === pid || m.person_b === pid)
    .map((m) => ({ person: people.get(partnerOf(m, pid)) || null, marriedOn: m.married_on, endedOn: m.ended_on, endReason: m.end_reason, current: !m.ended_on && !m.end_reason }))
    .filter((x) => x.person);

  // pedigree
  const buildAnc = (pid, depth, seen = new Set()) => {
    const person = people.get(pid);
    if (!person || seen.has(pid)) return null;
    const next = new Set(seen).add(pid);
    const canGoUp = depth < up;
    return {
      ...person,
      father: canGoUp && person.fatherId ? buildAnc(person.fatherId, depth + 1, next) : null,
      mother: canGoUp && person.motherId ? buildAnc(person.motherId, depth + 1, next) : null,
      hasMoreAncestors: !canGoUp && !!(person.fatherId || person.motherId),
    };
  };

  // descendants (children grouped under each parent; a child appears under whichever parent we reached it from)
  const childrenOf = new Map();
  for (const pid of descIds) {
    const c = people.get(pid);
    for (const parent of [c.fatherId, c.motherId]) {
      if (parent && pid !== id) {
        if (!childrenOf.has(parent)) childrenOf.set(parent, []);
        childrenOf.get(parent).push(c);
      }
    }
  }
  const byBirth = (a, b) => (a.dob || '9999').localeCompare(b.dob || '9999') || a.id - b.id;
  const buildDesc = (pid, depth, seen = new Set()) => {
    const person = people.get(pid);
    if (!person || seen.has(pid)) return null;
    const next = new Set(seen).add(pid);
    const kids = depth < down ? [...new Map((childrenOf.get(pid) || []).map((k) => [k.id, k])).values()].sort(byBirth) : [];
    return {
      ...person,
      spouse: person.spouseId ? people.get(person.spouseId) || null : null,
      spouses: spousesOf(pid),
      children: kids.map((k) => buildDesc(k.id, depth + 1, next)).filter(Boolean),
    };
  };

  return {
    focus,
    lineage: lineageIds.map((pid) => people.get(pid)).filter(Boolean),
    ancestors: buildAnc(id, 0),
    descendants: buildDesc(id, 0),
    family,
    limits: { up, down },
    truncated: ancIds.length >= MAX_NODES || descIds.length >= MAX_NODES,
  };
}
