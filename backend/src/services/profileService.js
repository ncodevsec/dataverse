import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { digitsOnly, escapeLike } from '../utils/phone.js';

// API field -> column. spouseId is handled separately because the relationship is symmetric.
export const FIELD_COLUMNS = {
  name: 'name', nickname: 'nickname', email: 'email', phone: 'phone', gender: 'gender', maritalStatus: 'marital_status',
  dob: 'dob', bloodGroup: 'blood_group', religion: 'religion', politicalView: 'political_view', nid: 'nid',
  occupation: 'occupation', educationLevel: 'education_level', educationGroup: 'education_group', lineage: 'lineage',
  presentStreet: 'present_street', presentCity: 'present_city', street: 'street', unionName: 'union_name',
  subDistrict: 'sub_district', district: 'district', state: 'state', zip: 'zip', country: 'country',
  facebook: 'facebook', instagram: 'instagram', tiktok: 'tiktok', about: 'about', tags: 'tags',
  fatherId: 'father_id', motherId: 'mother_id',
};

const photoUrl = (r) => (r.photo_updated_at ? `/api/profiles/${r.id}/photo?v=${new Date(r.photo_updated_at).getTime()}` : null);

/** Small card-sized representation used in lists, pickers and trees. */
export const toSummary = (r) => ({
  id: r.id,
  name: r.name,
  nickname: r.nickname,
  gender: r.gender,
  maritalStatus: r.marital_status,
  dob: r.dob,
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

export const SUMMARY_COLUMNS = `p.id, p.name, p.nickname, p.gender, p.marital_status, p.dob, p.blood_group, p.occupation,
  p.district, p.present_city, p.phone, p.lineage, p.tags, p.father_id, p.mother_id, p.spouse_id, p.photo_updated_at`;

// ---------------------------------------------------------------- permissions
const isAdmin = (u) => u?.role === 'ADMIN';
export const canEditProfile = (u, p) => !!u && (isAdmin(u) || p.created_by === u.id || u.profile_id === p.id);
export const canDeleteProfile = (u, p) => !!u && (isAdmin(u) || p.created_by === u.id);
/** NID is sensitive: only admins, the person it belongs to, and whoever created the record may see it. */
const canSeeNid = (u, p) => !!u && (isAdmin(u) || p.created_by === u.id || u.profile_id === p.id);

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
    facebook: r.facebook,
    instagram: r.instagram,
    tiktok: r.tiktok,
    about: r.about,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    permissions: { canEdit: canEditProfile(viewer, r), canDelete: canDeleteProfile(viewer, r) },
  };
}

// ---------------------------------------------------------------- search
export async function searchProfiles(f) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  let rank = '';
  if (f.q) {
    const tokens = f.q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const t of tokens) {
      const like = p(`%${escapeLike(t)}%`);
      const parts = [`p.name ILIKE ${like}`, `p.nickname ILIKE ${like}`, `p.email ILIKE ${like}`, `p.lineage ILIKE ${like}`];
      const d = digitsOnly(t);
      if (d.length >= 3 && /^[\d\s+\-()]+$/.test(t)) parts.push(`p.phone_digits LIKE ${p(`%${d}%`)}`);
      if (/^\d{1,9}$/.test(t)) parts.push(`p.id = ${p(Number(t))}`);
      where.push(`(${parts.join(' OR ')})`);
    }
    rank = `(lower(p.name) = lower(${p(f.q)})) DESC, (p.name ILIKE ${p(`${escapeLike(f.q)}%`)}) DESC, `;
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
                 FROM profiles p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY ${order} LIMIT ${p(limit)} OFFSET ${p(offset)}`;
  const { rows } = await query(sql, params);
  return { items: rows.map(toSummary), total: rows[0]?.total ?? 0 };
}

/** Lightweight lookup used by relationship pickers and global search. */
export async function lookupProfiles(q, limit = 8) {
  const { items } = await searchProfiles({ q, page: 1, limit, sort: 'name' });
  return items;
}

// ---------------------------------------------------------------- reads
export async function getProfileRow(id, client = { query }) {
  const { rows } = await client.query('SELECT * FROM profiles WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getFamily(id) {
  const sel = (where) => `SELECT ${SUMMARY_COLUMNS} FROM profiles p WHERE ${where}`;
  const row = await getProfileRow(id);
  if (!row) throw notFound('Profile not found');
  const [father, mother, spouse, children, siblings] = await Promise.all([
    row.father_id ? query(sel('p.id = $1'), [row.father_id]) : { rows: [] },
    row.mother_id ? query(sel('p.id = $1'), [row.mother_id]) : { rows: [] },
    row.spouse_id ? query(sel('p.id = $1'), [row.spouse_id]) : { rows: [] },
    query(`${sel('p.father_id = $1 OR p.mother_id = $1')} ORDER BY p.dob NULLS LAST, p.id LIMIT 200`, [id]),
    row.father_id || row.mother_id
      ? query(`${sel('p.id <> $1 AND ((p.father_id IS NOT NULL AND p.father_id = $2) OR (p.mother_id IS NOT NULL AND p.mother_id = $3))')}
               ORDER BY p.dob NULLS LAST, p.id LIMIT 200`, [id, row.father_id, row.mother_id])
      : { rows: [] },
  ]);
  return {
    father: father.rows[0] ? toSummary(father.rows[0]) : null,
    mother: mother.rows[0] ? toSummary(mother.rows[0]) : null,
    spouse: spouse.rows[0] ? toSummary(spouse.rows[0]) : null,
    children: children.rows.map(toSummary),
    siblings: siblings.rows.map(toSummary),
  };
}

export async function getProfile(id, viewer) {
  const row = await getProfileRow(id);
  if (!row) throw notFound('Profile not found');
  return { profile: toFull(row, viewer), family: await getFamily(id) };
}

// ---------------------------------------------------------------- relationship rules
async function validateRelations(client, id, current, data) {
  const ids = ['fatherId', 'motherId', 'spouseId'].map((k) => data[k]).filter((v) => v != null);
  if (id != null && ids.includes(id)) throw badRequest('A person cannot be their own parent or spouse');
  if (data.fatherId != null && data.fatherId === data.motherId) throw badRequest('Father and mother must be different people');
  if (!ids.length) return;

  const { rows } = await client.query('SELECT id, gender FROM profiles WHERE id = ANY($1::int[])', [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [key, label] of [['fatherId', 'Father'], ['motherId', 'Mother'], ['spouseId', 'Spouse']]) {
    if (data[key] != null && !byId.has(data[key])) throw badRequest(`${label} (ID ${data[key]}) does not exist`, { [key]: 'No profile with this ID' });
  }
  // Only enforce gender when the value is being changed, so legacy data never blocks unrelated edits.
  if (data.fatherId != null && data.fatherId !== current?.father_id && byId.get(data.fatherId).gender === 'FEMALE')
    throw badRequest('The selected father is recorded as female', { fatherId: 'Pick a male profile' });
  if (data.motherId != null && data.motherId !== current?.mother_id && byId.get(data.motherId).gender === 'MALE')
    throw badRequest('The selected mother is recorded as male', { motherId: 'Pick a female profile' });

  // A parent can never be one of the person's own descendants (prevents loops in the family tree).
  if (id != null && (data.fatherId != null || data.motherId != null)) {
    const parents = [data.fatherId, data.motherId].filter((v) => v != null);
    const { rows: loops } = await client.query(
      `WITH RECURSIVE d AS (
         SELECT id FROM profiles WHERE father_id = $1 OR mother_id = $1
         UNION
         SELECT c.id FROM profiles c JOIN d ON c.father_id = d.id OR c.mother_id = d.id
       ) SELECT id FROM d WHERE id = ANY($2::int[]) LIMIT 1`,
      [id, parents],
    );
    if (loops.length) throw conflict('That parent is already a descendant of this person', { fatherId: 'Would create a loop in the family tree' });
  }
}

/** Keeps the spouse link symmetric and un-links any previous partners on both sides. */
async function setSpouse(client, id, spouseId) {
  const cur = (await client.query('SELECT spouse_id FROM profiles WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!cur || (cur.spouse_id ?? null) === (spouseId ?? null)) return;
  if (cur.spouse_id) await client.query('UPDATE profiles SET spouse_id = NULL WHERE id = $1 AND spouse_id = $2', [cur.spouse_id, id]);
  if (spouseId) {
    const other = (await client.query('SELECT spouse_id FROM profiles WHERE id = $1 FOR UPDATE', [spouseId])).rows[0];
    if (other?.spouse_id && other.spouse_id !== id) {
      await client.query('UPDATE profiles SET spouse_id = NULL WHERE id = $1 AND spouse_id = $2', [other.spouse_id, spouseId]);
    }
    await client.query(
      `UPDATE profiles SET spouse_id = $2, marital_status = CASE WHEN marital_status IS NULL OR marital_status = 'SINGLE' THEN 'MARRIED' ELSE marital_status END
        WHERE id = $1`, [spouseId, id]);
  }
  await client.query(
    `UPDATE profiles SET spouse_id = $2,
       marital_status = CASE WHEN $2::int IS NOT NULL AND (marital_status IS NULL OR marital_status = 'SINGLE') THEN 'MARRIED' ELSE marital_status END
     WHERE id = $1`, [id, spouseId ?? null]);
}

// ---------------------------------------------------------------- writes
export async function createProfile(data, userId) {
  return withTransaction(async (client) => {
    await validateRelations(client, null, null, data);
    const cols = ['created_by', 'updated_by'];
    const vals = [userId, userId];
    for (const [key, col] of Object.entries(FIELD_COLUMNS)) {
      if (data[key] !== undefined) { cols.push(col); vals.push(data[key]); }
    }
    const { rows } = await client.query(
      `INSERT INTO profiles (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
    const id = rows[0].id;
    if (data.spouseId) await setSpouse(client, id, data.spouseId);
    return id;
  });
}

export async function updateProfile(id, data, userId) {
  return withTransaction(async (client) => {
    const current = (await client.query('SELECT * FROM profiles WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw notFound('Profile not found');
    await validateRelations(client, id, current, data);

    const sets = ['updated_by = $2'];
    const vals = [id, userId];
    const changed = [];
    for (const [key, col] of Object.entries(FIELD_COLUMNS)) {
      if (data[key] === undefined) continue;
      vals.push(data[key]);
      sets.push(`${col} = $${vals.length}`);
      changed.push(key);
    }
    await client.query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $1`, vals);
    if (data.spouseId !== undefined) {
      await setSpouse(client, id, data.spouseId);
      changed.push('spouseId');
    }
    return { changed, previousName: current.name };
  });
}

export async function deleteProfile(id) {
  // father/mother/spouse/contact links are ON DELETE SET NULL; photos and posts cascade.
  const { rows } = await query('DELETE FROM profiles WHERE id = $1 RETURNING id, name', [id]);
  if (!rows.length) throw notFound('Profile not found');
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
      `INSERT INTO profile_photos (profile_id, content_type, data, size_bytes) VALUES ($1, $2, $3, $4)
       ON CONFLICT (profile_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
         size_bytes = EXCLUDED.size_bytes, updated_at = now()`,
      [id, type, buffer, buffer.length]);
    await client.query('UPDATE profiles SET photo_updated_at = now() WHERE id = $1', [id]);
  });
}

export async function getPhoto(id) {
  const { rows } = await query('SELECT content_type, data, updated_at FROM profile_photos WHERE profile_id = $1', [id]);
  return rows[0] || null;
}

export async function deletePhoto(id) {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM profile_photos WHERE profile_id = $1', [id]);
    await client.query('UPDATE profiles SET photo_updated_at = NULL WHERE id = $1', [id]);
  });
}
