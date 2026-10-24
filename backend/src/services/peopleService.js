import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { digitsOnly, escapeLike } from '../utils/phone.js';
import { parseSearch } from '../utils/search.js';

// API field -> column. spouses / childIds / siblingIds are handled separately because they edit other rows.
export const FIELD_COLUMNS = {
  name: 'name', nickname: 'nickname', email: 'email', phone: 'phone', gender: 'gender', maritalStatus: 'marital_status',
  dob: 'dob', bloodGroup: 'blood_group', religion: 'religion', politicalView: 'political_view', nid: 'nid',
  occupation: 'occupation', educationLevel: 'education_level', educationGroup: 'education_group', lineage: 'lineage',
  presentStreet: 'present_street', presentCity: 'present_city', street: 'street', unionName: 'union_name',
  subDistrict: 'sub_district', district: 'district', state: 'state', zip: 'zip', country: 'country',
  socialLinks: 'social_links', about: 'about', tags: 'tags', dateOfDeath: 'date_of_death',
  fatherId: 'father_id', motherId: 'mother_id', website: 'website',
};

const photoUrl = (r) => (r.photo_updated_at ? `/api/peoples/${r.id}/photo?v=${new Date(r.photo_updated_at).getTime()}` : null);

/** Small card-sized representation used in lists, pickers and trees. */
export const toSummary = (r) => ({
  id: r.id,
  name: r.name,
  nickname: r.nickname,
  email: r.email,
  website: r.website,
  religion: r.religion,
  createdAt: r.created_at,
  gender: r.gender,
  maritalStatus: r.marital_status,
  dob: r.dob,
  dateOfDeath: r.date_of_death,
  bloodGroup: r.blood_group,
  occupation: r.occupation,
  district: r.district,
  presentCity: r.present_city,
  phone: r.phone,
  lineage: r.lineage,
  tags: r.tags || [],
  fatherId: r.father_id,
  motherId: r.mother_id,
  spouseId: r.spouse_id,
  photoUrl: photoUrl(r),
});

export const SUMMARY_COLUMNS = `p.id, p.name, p.nickname, p.email, p.website, p.religion, p.created_at, p.gender, p.marital_status, p.dob, p.date_of_death, p.blood_group, p.occupation,
  p.district, p.present_city, p.phone, p.lineage, p.tags, p.father_id, p.mother_id, p.spouse_id, p.photo_updated_at`;

// ---------------------------------------------------------------- permissions
const isAdmin = (u) => u?.role === 'ADMIN';
export const canEditPeople = (u, p) => !!u && (isAdmin(u) || p.created_by === u.id || u.people_id === p.id);
export const canDeletePeople = (u, p) => !!u && (isAdmin(u) || p.created_by === u.id);
/** NID is sensitive: only admins, the person it belongs to, and whoever created the record may see it. */
const canSeeNid = (u, p) => !!u && (isAdmin(u) || p.created_by === u.id || u.people_id === p.id);

const normalizeSocial = (v) => (Array.isArray(v) ? v : []);

export function toFull(r, viewer) {
  const nidVisible = canSeeNid(viewer, r);
  return {
    ...toSummary(r),
    email: r.email,
    politicalView: r.political_view,
    religion: r.religion,
    nid: nidVisible ? r.nid : null,
    nidHidden: !nidVisible && !!r.nid,
    educationLevel: r.education_level,
    educationGroup: r.education_group,
    presentStreet: r.present_street,
    street: r.street,
    unionName: r.union_name,
    subDistrict: r.sub_district,
    state: r.state,
    zip: r.zip,
    country: r.country,
    website: r.website,
    socialLinks: normalizeSocial(r.social_links),
    about: r.about,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    permissions: { canEdit: canEditPeople(viewer, r), canDelete: canDeletePeople(viewer, r) },
  };
}

// ---------------------------------------------------------------- search
export async function searchPeoples(f) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  let rank = '';
  if (f.q) {
    const { tags, words } = parseSearch(f.q);
    for (const tag of tags) where.push(`${p(tag)} = ANY(p.tags)`);
    for (const t of words) {
      const like = p(`%${escapeLike(t)}%`);
      const parts = [`p.name ILIKE ${like}`, `p.nickname ILIKE ${like}`, `p.email ILIKE ${like}`, `p.lineage ILIKE ${like}`];
      const d = digitsOnly(t);
      if (d.length >= 3 && /^[\d\s+\-()]+$/.test(t)) parts.push(`p.phone_digits LIKE ${p(`%${d}%`)}`);
      if (/^\d{1,9}$/.test(t)) parts.push(`p.id = ${p(Number(t))}`);
      where.push(`(${parts.join(' OR ')})`);
    }
    if (words.length) { const phrase = words.join(' '); rank = `(lower(p.name) = lower(${p(phrase)})) DESC, (p.name ILIKE ${p(`${escapeLike(phrase)}%`)}) DESC, `; }
  }
  if (f.gender) where.push(`p.gender = ${p(f.gender)}`);
  if (f.maritalStatus) where.push(`p.marital_status = ${p(f.maritalStatus)}`);
  if (f.bloodGroup) where.push(`p.blood_group = ${p(f.bloodGroup)}`);
  if (f.district) where.push(`lower(p.district) = lower(${p(f.district)})`);
  if (f.tag) where.push(`${p(f.tag)} = ANY(p.tags)`);

  const order = {
    name: `${rank}lower(p.name), p.id`,
    newest: `${rank}p.created_at DESC, p.id DESC`,
    oldest: `${rank}p.created_at ASC, p.id ASC`,
    id: `${rank}p.id ASC`,
  }[f.sort || 'name'];

  const limit = f.limit || 20;
  const offset = ((f.page || 1) - 1) * limit;
  const sql = `SELECT ${SUMMARY_COLUMNS}, count(*) OVER() AS total
                 FROM peoples p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY ${order} LIMIT ${p(limit)} OFFSET ${p(offset)}`;
  const { rows } = await query(sql, params);
  return { items: rows.map(toSummary), total: rows[0]?.total ?? 0 };
}

/** Lightweight lookup used by relationship pickers and global search. */
export async function lookupPeoples(q, limit = 8) {
  const { items } = await searchPeoples({ q, page: 1, limit, sort: 'name' });
  return items;
}

// ---------------------------------------------------------------- reads
export async function getPeopleRow(id, client = { query }) {
  const { rows } = await client.query('SELECT * FROM peoples WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getFamily(id) {
  const sel = (where) => `SELECT ${SUMMARY_COLUMNS} FROM peoples p WHERE ${where}`;
  const row = await getPeopleRow(id);
  if (!row) throw notFound('People not found');
  const [father, mother, spouse, children, siblings, marriageRows] = await Promise.all([
    row.father_id ? query(sel('p.id = $1'), [row.father_id]) : { rows: [] },
    row.mother_id ? query(sel('p.id = $1'), [row.mother_id]) : { rows: [] },
    row.spouse_id ? query(sel('p.id = $1'), [row.spouse_id]) : { rows: [] },
    query(`${sel('p.father_id = $1 OR p.mother_id = $1')} ORDER BY p.dob NULLS LAST, p.id LIMIT 200`, [id]),
    row.father_id || row.mother_id
      ? query(`${sel('p.id <> $1 AND ((p.father_id IS NOT NULL AND p.father_id = $2) OR (p.mother_id IS NOT NULL AND p.mother_id = $3))')}
               ORDER BY p.dob NULLS LAST, p.id LIMIT 200`, [id, row.father_id, row.mother_id])
      : { rows: [] },
    query(`SELECT m.id AS marriage_id, m.married_on, m.ended_on, m.end_reason, m.note, ${SUMMARY_COLUMNS}
             FROM marriages m JOIN peoples p ON p.id = CASE WHEN m.person_a = $1 THEN m.person_b ELSE m.person_a END
            WHERE m.person_a = $1 OR m.person_b = $1
            ORDER BY m.married_on NULLS LAST, m.id`, [id]),
  ]);
  return {
    father: father.rows[0] ? toSummary(father.rows[0]) : null,
    mother: mother.rows[0] ? toSummary(mother.rows[0]) : null,
    spouse: spouse.rows[0] ? toSummary(spouse.rows[0]) : null,
    spouses: marriageRows.rows.map((r) => ({
      marriageId: r.marriage_id, person: toSummary(r), marriedOn: r.married_on, endedOn: r.ended_on, endReason: r.end_reason, note: r.note,
      current: !r.ended_on && !r.end_reason,
    })),
    children: children.rows.map(toSummary),
    siblings: siblings.rows.map(toSummary),
  };
}

const PERMANENT = ['street', 'union_name', 'sub_district', 'district', 'state', 'zip', 'country'];
const hasAddress = (r) => PERMANENT.some((c) => r[c] != null && String(r[c]).trim() !== '');

/** If the permanent address is empty, use the nearest paternal ancestor's address (father, then grandfather...). */
async function inheritedAddress(row) {
  if (hasAddress(row) || !row.father_id) return null;
  const { rows } = await query(
    `WITH RECURSIVE c AS (
       SELECT id, name, father_id, ${PERMANENT.join(', ')}, 1 AS depth FROM peoples WHERE id = $1
       UNION ALL
       SELECT p.id, p.name, p.father_id, ${PERMANENT.map((x) => `p.${x}`).join(', ')}, c.depth + 1 FROM c JOIN peoples p ON p.id = c.father_id WHERE c.depth < 20
     ) SELECT * FROM c WHERE (${PERMANENT.map((x) => `coalesce(btrim(${x}), '') <> ''`).join(' OR ')}) ORDER BY depth LIMIT 1`, [row.father_id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { from: { id: r.id, name: r.name }, street: r.street, unionName: r.union_name, subDistrict: r.sub_district, district: r.district, state: r.state, zip: r.zip, country: r.country };
}

export async function getPeople(id, viewer) {
  const row = await getPeopleRow(id);
  if (!row) throw notFound('People not found');
  const [family, inherited, saved] = await Promise.all([
    getFamily(id),
    inheritedAddress(row),
    query('SELECT count(*)::int AS n FROM caller_contacts WHERE connection_id = $1', [id]),
  ]);
  return { people: { ...toFull(row, viewer), inheritedAddress: inherited, savedContactsCount: saved.rows[0].n }, family };
}

// ---------------------------------------------------------------- relationship rules
async function validateRelations(client, id, current, data) {
  const ids = ['fatherId', 'motherId'].map((k) => data[k]).filter((v) => v != null);
  if (id != null && ids.includes(id)) throw badRequest('A person cannot be their own parent');
  if (data.fatherId != null && data.fatherId === data.motherId) throw badRequest('Father and mother must be different people');
  if (!ids.length) return;

  const { rows } = await client.query('SELECT id, gender FROM peoples WHERE id = ANY($1::int[])', [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [key, label] of [['fatherId', 'Father'], ['motherId', 'Mother']]) {
    if (data[key] == null) continue;
    if (!byId.has(data[key])) throw badRequest(`${label} (ID ${data[key]}) does not exist`, { [key]: 'No people with this ID' });
  }
  // Only enforce gender when the value is being changed, so legacy data never blocks unrelated edits.
  if (data.fatherId != null && data.fatherId !== current?.father_id && byId.get(data.fatherId).gender === 'FEMALE')
    throw badRequest('The selected father is recorded as female', { fatherId: 'Pick a male people' });
  if (data.motherId != null && data.motherId !== current?.mother_id && byId.get(data.motherId).gender === 'MALE')
    throw badRequest('The selected mother is recorded as male', { motherId: 'Pick a female people' });

  // A parent can never be one of the person's own descendants (prevents loops in the family tree).
  if (id != null && (data.fatherId != null || data.motherId != null)) {
    const parents = [data.fatherId, data.motherId].filter((v) => v != null);
    const { rows: loops } = await client.query(
      `WITH RECURSIVE d AS (
         SELECT id FROM peoples WHERE father_id = $1 OR mother_id = $1
         UNION
         SELECT c.id FROM peoples c JOIN d ON c.father_id = d.id OR c.mother_id = d.id
       ) SELECT id FROM d WHERE id = ANY($2::int[]) LIMIT 1`,
      [id, parents],
    );
    if (loops.length) throw conflict('That parent is already a descendant of this person', { fatherId: 'Would create a loop in the family tree' });
  }
}

/** peoples.spouse_id = the current spouse (latest marriage that has not ended). Also keeps marital_status sensible. */
async function refreshCurrentSpouse(client, ids) {
  await client.query(
    `UPDATE peoples p SET spouse_id = (
        SELECT CASE WHEN m.person_a = p.id THEN m.person_b ELSE m.person_a END FROM marriages m
         WHERE (m.person_a = p.id OR m.person_b = p.id) AND m.ended_on IS NULL AND m.end_reason IS NULL
         ORDER BY m.married_on DESC NULLS LAST, m.id DESC LIMIT 1)
      WHERE p.id = ANY($1::int[])`, [ids]);
  await client.query(
    `UPDATE peoples p SET marital_status = CASE
        WHEN p.spouse_id IS NOT NULL THEN CASE WHEN p.marital_status IS NULL OR p.marital_status = 'SINGLE' THEN 'MARRIED' ELSE p.marital_status END
        WHEN p.marital_status = 'MARRIED' THEN COALESCE((
          SELECT CASE m.end_reason WHEN 'WIDOWED' THEN 'WIDOWED' WHEN 'DIVORCED' THEN 'DIVORCED' WHEN 'SEPARATED' THEN 'DIVORCED' END
            FROM marriages m WHERE (m.person_a = p.id OR m.person_b = p.id) AND m.end_reason IS NOT NULL
            ORDER BY m.ended_on DESC NULLS LAST, m.id DESC LIMIT 1), p.marital_status)
        ELSE p.marital_status END
      WHERE p.id = ANY($1::int[])`, [ids]);
}

/** Makes this person's marriages match the given list (add / update / remove), one record per spouse. */
async function syncSpouses(client, id, spouses) {
  const self = await getPeopleRow(id, client);
  const ids = spouses.map((x) => x.personId);
  if (ids.includes(id)) throw badRequest('A person cannot be their own spouse', { spouses: 'Invalid selection' });
  const found = (await client.query('SELECT id FROM peoples WHERE id = ANY($1::int[])', [ids])).rows;
  for (const sp of spouses) {
    const row = found.find((r) => r.id === sp.personId);
    if (!row) throw badRequest(`Spouse (ID ${sp.personId}) does not exist`, { spouses: `No people with ID ${sp.personId}` });
    if (sp.marriedOn && sp.endedOn && sp.endedOn < sp.marriedOn) throw badRequest('A marriage cannot end before it began', { spouses: 'End date is before the marriage date' });
  }
  const existing = (await client.query('SELECT * FROM marriages WHERE person_a = $1 OR person_b = $1 FOR UPDATE', [id])).rows;
  const other = (m) => (m.person_a === id ? m.person_b : m.person_a);
  const touched = new Set([id]);
  for (const m of existing) if (!ids.includes(other(m))) { await client.query('DELETE FROM marriages WHERE id = $1', [m.id]); touched.add(other(m)); }
  for (const sp of spouses) {
    const [a, b] = id < sp.personId ? [id, sp.personId] : [sp.personId, id];
    const endReason = sp.endReason ?? (sp.endedOn ? 'OTHER' : null);
    await client.query(
      `INSERT INTO marriages (person_a, person_b, married_on, ended_on, end_reason) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (person_a, person_b) DO UPDATE SET married_on = EXCLUDED.married_on, ended_on = EXCLUDED.ended_on, end_reason = EXCLUDED.end_reason`,
      [a, b, sp.marriedOn ?? null, sp.endedOn ?? null, endReason]);
    touched.add(sp.personId);
  }
  await refreshCurrentSpouse(client, [...touched]);
}

function validateDates(current, data) {
  const dob = data.dob !== undefined ? data.dob : current?.dob;
  const dod = data.dateOfDeath !== undefined ? data.dateOfDeath : current?.date_of_death;
  if (dob && dod && dod < dob) throw badRequest('Date of death cannot be before date of birth', { dateOfDeath: 'Cannot be before the date of birth' });
}

const idsOf = (rows) => rows.map((r) => r.id);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
async function ancestorsOf(client, id) {
  const { rows } = await client.query(
    `WITH RECURSIVE a AS (
       SELECT id, father_id, mother_id FROM peoples WHERE id = $1
       UNION SELECT p.id, p.father_id, p.mother_id FROM a JOIN peoples p ON p.id = a.father_id OR p.id = a.mother_id
     ) SELECT id FROM a WHERE id <> $1`, [id]);
  return idsOf(rows);
}
async function descendantsOf(client, id) {
  const { rows } = await client.query(
    `WITH RECURSIVE d AS (
       SELECT id FROM peoples WHERE father_id = $1 OR mother_id = $1
       UNION SELECT c.id FROM d JOIN peoples c ON c.father_id = d.id OR c.mother_id = d.id
     ) SELECT id FROM d`, [id]);
  return idsOf(rows);
}

/**
 * Makes the person's children / siblings match the given lists by editing the *other* peoples' parent links.
 *  - Filling an empty parent slot on someone else's people is allowed for any editor of this people.
 *  - Replacing or removing an existing link on someone else's people requires edit rights on that people.
 *  - Loops (an ancestor becoming a child/sibling, etc.) are rejected.
 */
async function syncRelatives(client, id, data, viewer) {
  const wantsKids = Array.isArray(data.childIds);
  const wantsSibs = Array.isArray(data.siblingIds);
  if (!wantsKids && !wantsSibs) return [];
  const self = await getPeopleRow(id, client);
  const changed = [];
  const loadMany = async (ids) => new Map((await client.query('SELECT * FROM peoples WHERE id = ANY($1::int[]) FOR UPDATE', [ids])).rows.map((r) => [r.id, r]));
  const mayEdit = (row) => canEditPeople(viewer, row);

  if (wantsKids) {
    const desired = data.childIds;
    const current = idsOf((await client.query('SELECT id FROM peoples WHERE father_id = $1 OR mother_id = $1', [id])).rows);
    if (!sameSet(desired, current)) {
      const col = self.gender === 'MALE' ? 'father_id' : self.gender === 'FEMALE' ? 'mother_id' : null;
      if (!col) throw badRequest('Set this person\'s gender before linking children', { childIds: 'Gender is required to link children' });
      if (desired.includes(id)) throw badRequest('A person cannot be their own child', { childIds: 'Invalid selection' });
      const added = desired.filter((x) => !current.includes(x));
      const removed = current.filter((x) => !desired.includes(x));
      const rows = await loadMany([...added, ...removed]);
      for (const cid of added) {
        if (!rows.has(cid)) throw badRequest(`Child (ID ${cid}) does not exist`, { childIds: `No people with ID ${cid}` });
      }
      if (added.length) {
        const bad = new Set(await ancestorsOf(client, id));
        const hit = added.find((x) => bad.has(x));
        if (hit) throw conflict('An ancestor cannot also be a child', { childIds: `People ${hit} is an ancestor of this person` });
      }
      for (const cid of added) {
        const row = rows.get(cid);
        if (row[col] != null && row[col] !== id && !mayEdit(row)) throw forbidden(`"${row.name}" already has a ${col === 'father_id' ? 'father' : 'mother'} recorded and you cannot edit that people`);
        await client.query(`UPDATE peoples SET ${col} = $2, updated_by = $3 WHERE id = $1`, [cid, id, viewer.id]);
      }
      for (const cid of removed) {
        const row = rows.get(cid);
        if (!row) continue;
        if (!mayEdit(row)) throw forbidden(`You cannot unlink "${row.name}" because you cannot edit that people`);
        await client.query('UPDATE peoples SET father_id = CASE WHEN father_id = $2 THEN NULL ELSE father_id END, mother_id = CASE WHEN mother_id = $2 THEN NULL ELSE mother_id END, updated_by = $3 WHERE id = $1', [cid, id, viewer.id]);
      }
      changed.push('childIds');
    }
  }

  if (wantsSibs) {
    const me = await getPeopleRow(id, client); // re-read: parents may have just changed
    const desired = data.siblingIds;
    const current = idsOf((await client.query(
      `SELECT id FROM peoples WHERE id <> $1 AND ((father_id IS NOT NULL AND father_id = $2) OR (mother_id IS NOT NULL AND mother_id = $3))`, [id, me.father_id, me.mother_id])).rows);
    if (!sameSet(desired, current)) {
      if (desired.includes(id)) throw badRequest('A person cannot be their own sibling', { siblingIds: 'Invalid selection' });
      const added = desired.filter((x) => !current.includes(x));
      const removed = current.filter((x) => !desired.includes(x));
      if (added.length && !me.father_id && !me.mother_id) throw badRequest('Link a father or mother first; siblings are people who share a parent', { siblingIds: 'This person has no parents linked' });
      const rows = await loadMany([...added, ...removed]);
      for (const sid of added) {
        if (!rows.has(sid)) throw badRequest(`Sibling (ID ${sid}) does not exist`, { siblingIds: `No people with ID ${sid}` });
      }
      if (added.length) {
        const bad = new Set([...(await ancestorsOf(client, id)), ...(await descendantsOf(client, id))]);
        const hit = added.find((x) => bad.has(x));
        if (hit) throw conflict('An ancestor or descendant cannot also be a sibling', { siblingIds: `People ${hit} is an ancestor or descendant of this person` });
      }
      for (const sid of added) {
        const row = rows.get(sid);
        const wantF = me.father_id; const wantM = me.mother_id;
        const clashes = (wantF && row.father_id != null && row.father_id !== wantF) || (wantM && row.mother_id != null && row.mother_id !== wantM);
        if (clashes && !mayEdit(row)) throw forbidden(`"${row.name}" has different parents recorded and you cannot edit that people`);
        await client.query('UPDATE peoples SET father_id = COALESCE($2, father_id), mother_id = COALESCE($3, mother_id), updated_by = $4 WHERE id = $1', [sid, wantF, wantM, viewer.id]);
      }
      for (const sid of removed) {
        const row = rows.get(sid);
        if (!row) continue;
        if (!mayEdit(row)) throw forbidden(`You cannot unlink "${row.name}" because you cannot edit that people`);
        await client.query(
          `UPDATE peoples SET father_id = CASE WHEN father_id = $2 THEN NULL ELSE father_id END,
                               mother_id = CASE WHEN mother_id = $3 THEN NULL ELSE mother_id END, updated_by = $4 WHERE id = $1`,
          [sid, me.father_id, me.mother_id, viewer.id]);
      }
      changed.push('siblingIds');
    }
  }
  return changed;
}

// ---------------------------------------------------------------- writes
export async function createPeopleTx(client, data, viewer) {
  await validateRelations(client, null, null, data);
  validateDates(null, data);
  const cols = ['created_by', 'updated_by'];
  const vals = [viewer.id, viewer.id];
  for (const [key, col] of Object.entries(FIELD_COLUMNS)) {
    if (data[key] === undefined) continue;
    cols.push(col); vals.push(key === 'socialLinks' ? JSON.stringify(data[key]) : data[key]);
  }
  const { rows } = await client.query(
    `INSERT INTO peoples (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
  const id = rows[0].id;
  if (data.spouses?.length) await syncSpouses(client, id, data.spouses);
  await syncRelatives(client, id, data, viewer);
  return id;
}
export const createPeople = (data, viewer) => withTransaction((client) => createPeopleTx(client, data, viewer));

export async function updatePeopleTx(client, id, data, viewer) {
  const current = (await client.query('SELECT * FROM peoples WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!current) throw notFound('People not found');
  await validateRelations(client, id, current, data);
  validateDates(current, data);
  const sets = ['updated_by = $2'];
  const vals = [id, viewer.id];
  const changed = [];
  for (const [key, col] of Object.entries(FIELD_COLUMNS)) {
    if (data[key] === undefined) continue;
    vals.push(key === 'socialLinks' ? JSON.stringify(data[key]) : data[key]);
    sets.push(`${col} = $${vals.length}`);
    changed.push(key);
  }
  await client.query(`UPDATE peoples SET ${sets.join(', ')} WHERE id = $1`, vals);
  if (data.spouses !== undefined) {
    await syncSpouses(client, id, data.spouses);
    changed.push('spouses');
  }
  changed.push(...(await syncRelatives(client, id, data, viewer)));
  return { changed, previousName: current.name };
}
export const updatePeople = (id, data, viewer) => withTransaction((client) => updatePeopleTx(client, id, data, viewer));

// ---------------------------------------------------------------- one-step "add a family member"
const ADDRESS_KEYS = [['street', 'street'], ['unionName', 'union_name'], ['subDistrict', 'sub_district'], ['district', 'district'], ['state', 'state'], ['zip', 'zip'], ['country', 'country']];
const pickAddress = (row) => Object.fromEntries(ADDRESS_KEYS.filter(([, c]) => row[c] != null && String(row[c]).trim() !== '').map(([k, c]) => [k, row[c]]));
/** Permanent address a profile effectively has: its own, else the nearest paternal ancestor's. */
async function effectiveAddress(row) {
  if (hasAddress(row)) return pickAddress(row);
  const inh = await inheritedAddress(row);
  return inh ? Object.fromEntries(ADDRESS_KEYS.map(([k]) => [k, inh[k]]).filter(([, v]) => v)) : {};
}

/** What a newly created relative inherits from `self`, by relationship. */
async function inheritedFor(client, self, relation) {
  const out = {};
  if (self.religion) out.religion = self.religion;
  const spouse = self.spouse_id ? (await client.query('SELECT * FROM peoples WHERE id = $1', [self.spouse_id])).rows[0] : null;
  const addr = await effectiveAddress(self);
  if (relation === 'child') {
    const male = self.gender !== 'FEMALE';
    if (male) { out.fatherId = self.id; if (spouse && spouse.gender !== 'MALE') out.motherId = spouse.id; } else { out.motherId = self.id; if (spouse && spouse.gender !== 'FEMALE') out.fatherId = spouse.id; }
    const father = male ? self : spouse && spouse.gender === 'MALE' ? spouse : null;
    if (father?.lineage) out.lineage = father.lineage;
    Object.assign(out, father ? (father === self ? addr : await effectiveAddress(father)) : addr);
  } else if (relation === 'sibling') {
    if (self.father_id) out.fatherId = self.father_id;
    if (self.mother_id) out.motherId = self.mother_id;
    if (self.lineage) out.lineage = self.lineage;
    Object.assign(out, addr);
  } else if (relation === 'father') {
    out.gender = 'MALE'; if (self.lineage) out.lineage = self.lineage; Object.assign(out, addr);
  } else if (relation === 'mother') {
    out.gender = 'FEMALE'; Object.assign(out, addr);
  } else if (relation === 'spouse') {
    if (self.gender === 'MALE') out.gender = 'FEMALE'; else if (self.gender === 'FEMALE') out.gender = 'MALE';
    if (self.present_street) out.presentStreet = self.present_street;
    if (self.present_city) out.presentCity = self.present_city;
  }
  return out;
}

/** Links an existing person, or creates a new one (inheriting shared data), as father / mother / spouse / sibling / child. */
export async function addFamilyMember(id, { relation, existingId, create }, viewer) {
  return withTransaction(async (client) => {
    const self = (await client.query('SELECT * FROM peoples WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!self) throw notFound('People not found');
    if ((relation === 'sibling') && !self.father_id && !self.mother_id) {
      throw badRequest('Siblings share a parent: link a father or mother first', { relation: 'This person has no parents on file' });
    }
    if (existingId === id) throw badRequest('A person cannot be their own relative', { existingId: 'Invalid selection' });
    let otherId = existingId;
    let createdNow = false;
    if (create) {
      const inherited = await inheritedFor(client, self, relation);
      const data = { ...inherited, name: create.name, nickname: create.nickname ?? undefined, gender: create.gender ?? inherited.gender ?? undefined };
      otherId = await createPeopleTx(client, data, viewer); // child / sibling are already linked through the inherited parent ids
      createdNow = true;
    } else {
      const { rows } = await client.query('SELECT id FROM peoples WHERE id = $1', [otherId]);
      if (!rows.length) throw badRequest(`Person ${otherId} does not exist`, { existingId: 'No person with this ID' });
    }
    if (relation === 'father' || relation === 'mother') {
      const col = relation === 'father' ? 'father_id' : 'mother_id';
      if (self[col] && self[col] !== otherId) throw conflict(`This person already has a ${relation}. Change it on the edit page.`, { relation: `A ${relation} is already linked` });
      if (self[col] !== otherId) await updatePeopleTx(client, id, { [relation === 'father' ? 'fatherId' : 'motherId']: otherId }, viewer);
    } else if (relation === 'spouse') {
      const marriages = (await client.query('SELECT * FROM marriages WHERE person_a = $1 OR person_b = $1', [id])).rows;
      if (marriages.some((m) => m.person_a === otherId || m.person_b === otherId)) throw conflict('Already married to this person', { existingId: 'Already linked as a spouse' });
      const spouses = marriages.map((m) => ({ personId: m.person_a === id ? m.person_b : m.person_a, marriedOn: m.married_on, endedOn: m.ended_on, endReason: m.end_reason }));
      await updatePeopleTx(client, id, { spouses: [...spouses, { personId: otherId }] }, viewer);
    } else if (!createdNow && relation === 'child') {
      const kids = (await client.query('SELECT id FROM peoples WHERE father_id = $1 OR mother_id = $1', [id])).rows.map((r) => r.id);
      if (kids.includes(otherId)) throw conflict('Already linked as a child', { existingId: 'Already linked' });
      await updatePeopleTx(client, id, { childIds: [...kids, otherId] }, viewer);
    } else if (!createdNow && relation === 'sibling') {
      const sibs = (await client.query(
        'SELECT id FROM peoples WHERE id <> $1 AND ((father_id IS NOT NULL AND father_id = $2) OR (mother_id IS NOT NULL AND mother_id = $3))', [id, self.father_id, self.mother_id])).rows.map((r) => r.id);
      if (sibs.includes(otherId)) throw conflict('Already linked as a sibling', { existingId: 'Already linked' });
      await updatePeopleTx(client, id, { siblingIds: [...sibs, otherId] }, viewer);
    }
    return { otherId, created: createdNow };
  });
}

export async function deletePeople(id) {
  // father/mother/spouse/contact links are ON DELETE SET NULL; photos and posts cascade.
  const { rows } = await query('DELETE FROM peoples WHERE id = $1 RETURNING id, name', [id]);
  if (!rows.length) throw notFound('People not found');
  return rows[0];
}

// ---------------------------------------------------------------- photos
const MAGIC = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

/** Never trust the Content-Type header: sniff the real file signature. */
export const sniffImageType = (buf) => MAGIC.find((m) => buf.length > 12 && m.test(buf))?.type ?? null;

export async function setPhoto(id, buffer) {
  const type = sniffImageType(buffer);
  if (!type) throw badRequest('Upload a JPEG, PNG or WebP image');
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO people_photos (people_id, content_type, data, size_bytes) VALUES ($1, $2, $3, $4)
       ON CONFLICT (people_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
         size_bytes = EXCLUDED.size_bytes, updated_at = now()`,
      [id, type, buffer, buffer.length]);
    await client.query('UPDATE peoples SET photo_updated_at = now() WHERE id = $1', [id]);
  });
}

export async function getPhoto(id) {
  const { rows } = await query('SELECT content_type, data, updated_at FROM people_photos WHERE people_id = $1', [id]);
  return rows[0] || null;
}

export async function deletePhoto(id) {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM people_photos WHERE people_id = $1', [id]);
    await client.query('UPDATE peoples SET photo_updated_at = NULL WHERE id = $1', [id]);
  });
}
