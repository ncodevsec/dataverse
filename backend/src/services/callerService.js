import { query, withTransaction } from '../db/pool.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { digitsOnly, escapeLike, formatPhone } from '../utils/phone.js';
import { parseVcf } from '../utils/vcf.js';

const SELECT = `SELECT c.id, c.name, c.number, c.connection_id, c.profile_id, c.created_by, c.created_at,
       rel.name AS relative_name, prof.name AS profile_name, prof.photo_updated_at AS profile_photo
  FROM caller_contacts c
  LEFT JOIN profiles rel  ON rel.id  = c.connection_id
  LEFT JOIN profiles prof ON prof.id = c.profile_id`;

export const toContact = (r, viewer) => ({
  id: r.id,
  name: r.name,
  number: r.number,
  connectionId: r.connection_id,
  relativeName: r.relative_name,
  profileId: r.profile_id,
  profileName: r.profile_name,
  createdAt: r.created_at,
  canEdit: !!viewer && (viewer.role === 'ADMIN' || r.created_by === viewer.id),
});

/**
 * Search rules:
 *  - `q` is a smart single box: mostly digits => phone search, otherwise name search
 *  - `name` / `number` can be combined for the legacy two-field form
 *  - matching is partial, case-insensitive and Unicode-safe (Bangla works); backed by trigram indexes
 */
export async function searchContacts(f, viewer) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  let name = f.name;
  let number = f.number;
  if (f.q) {
    const looksNumeric = /^[\d\s+\-()*#]+$/.test(f.q) && digitsOnly(f.q).length >= 2;
    if (looksNumeric) number = number || f.q; else name = name || f.q;
  }
  if (name) for (const t of name.split(/\s+/).filter(Boolean).slice(0, 6)) where.push(`c.name ILIKE ${p(`%${escapeLike(t)}%`)}`);
  if (number) {
    const d = digitsOnly(number);
    if (d.length) where.push(`c.number_digits LIKE ${p(`%${d}%`)}`);
    else where.push(`c.number ILIKE ${p(`%${escapeLike(number)}%`)}`);
  }
  if (f.relative && f.relative !== 'all') {
    if (f.relative === 'none') where.push('c.connection_id IS NULL');
    else if (/^\d+$/.test(f.relative)) where.push(`c.connection_id = ${p(Number(f.relative))}`);
  }

  const order = { name: 'c.name_key, c.id', number: 'c.number_digits, c.name_key', newest: 'c.created_at DESC, c.id DESC' }[f.sort || 'name'];
  const limit = f.limit || 20;
  const offset = ((f.page || 1) - 1) * limit;
  const { rows } = await query(
    `${SELECT.replace('SELECT c.id,', 'SELECT count(*) OVER() AS total, c.id,')}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ${p(limit)} OFFSET ${p(offset)}`, params);
  return { items: rows.map((r) => toContact(r, viewer)), total: rows[0]?.total ?? 0 };
}

/** Profiles that own at least one phonebook, for the "Saved by" filter. */
export async function listRelatives() {
  const { rows } = await query(
    `SELECT p.id, p.name, count(*)::int AS contacts
       FROM caller_contacts c JOIN profiles p ON p.id = c.connection_id
      GROUP BY p.id, p.name ORDER BY lower(p.name)`);
  return rows;
}

export async function getContact(id, viewer) {
  const { rows } = await query(`${SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ? toContact(rows[0], viewer) : null;
}

export async function getContactRow(id) {
  const { rows } = await query('SELECT * FROM caller_contacts WHERE id = $1', [id]);
  return rows[0] || null;
}

async function profileExists(id) {
  if (id == null) return;
  const { rows } = await query('SELECT 1 FROM profiles WHERE id = $1', [id]);
  if (!rows.length) throw badRequest(`Profile ${id} does not exist`);
}

/** When a number matches exactly one profile's phone (comparing the last 10 digits), link to it automatically. */
async function guessProfileId(number) {
  const d = digitsOnly(number);
  if (d.length < 10) return null;
  const { rows } = await query(
    `SELECT id FROM profiles WHERE length(phone_digits) >= 10 AND right(phone_digits, 10) = right($1, 10) LIMIT 2`, [d]);
  return rows.length === 1 ? rows[0].id : null;
}

export async function createContact(data, userId) {
  await Promise.all([profileExists(data.connectionId), profileExists(data.profileId)]);
  const number = formatPhone(data.number);
  const profileId = data.profileId ?? (await guessProfileId(number));
  const { rows } = await query(
    `INSERT INTO caller_contacts (name, number, connection_id, profile_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.name.trim(), number, data.connectionId ?? null, profileId, userId]);
  return rows[0].id;
}

export async function updateContact(id, data) {
  if (data.connectionId !== undefined) await profileExists(data.connectionId);
  if (data.profileId !== undefined) await profileExists(data.profileId);
  const sets = [];
  const vals = [id];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (data.name !== undefined) add('name', data.name.trim());
  if (data.number !== undefined) add('number', formatPhone(data.number));
  if (data.connectionId !== undefined) add('connection_id', data.connectionId);
  if (data.profileId !== undefined) add('profile_id', data.profileId);
  if (!sets.length) return;
  const { rowCount } = await query(`UPDATE caller_contacts SET ${sets.join(', ')} WHERE id = $1`, vals);
  if (!rowCount) throw notFound('Contact not found');
}

export async function deleteContact(id) {
  const { rowCount } = await query('DELETE FROM caller_contacts WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Contact not found');
}

/** Links contacts of one phonebook (or all) to profiles whose phone number matches uniquely. */
export async function autolink(client, connectionId = null) {
  const { rowCount } = await client.query(
    `UPDATE caller_contacts c SET profile_id = m.id
       FROM (SELECT right(phone_digits, 10) AS k, min(id) AS id, count(*) AS n
               FROM profiles WHERE length(phone_digits) >= 10 GROUP BY 1) m
      WHERE c.profile_id IS NULL AND length(c.number_digits) >= 10 AND right(c.number_digits, 10) = m.k AND m.n = 1
        AND ($1::int IS NULL OR c.connection_id = $1)`, [connectionId]);
  return rowCount;
}

export async function importVcf({ connectionId, vcf }, userId) {
  await profileExists(connectionId);
  const parsed = parseVcf(vcf);
  if (!parsed.length) throw badRequest('No contacts with phone numbers were found in that file');
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `INSERT INTO caller_contacts (name, number, connection_id, created_by)
       SELECT n, t, $3::int, $4::uuid FROM unnest($1::text[], $2::text[]) AS u(n, t)
       ON CONFLICT DO NOTHING`,
      [parsed.map((c) => c.name), parsed.map((c) => c.number), connectionId ?? null, userId]);
    const linked = await autolink(client, connectionId ?? null);
    return { parsed: parsed.length, inserted: rowCount, duplicatesSkipped: parsed.length - rowCount, linked };
  });
}

/** Numbers saved in more than one phonebook / under several names (useful for spotting data-entry noise). */
export async function duplicateReport() {
  const { rows } = await query(
    `SELECT number_digits, count(DISTINCT COALESCE(connection_id, 0))::int AS phonebooks, count(DISTINCT name_key)::int AS names, count(*)::int AS entries
       FROM caller_contacts GROUP BY number_digits HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 25`);
  const total = await query(`SELECT count(*)::int AS numbers_shared FROM (SELECT 1 FROM caller_contacts GROUP BY number_digits HAVING count(*) > 1) s`);
  return { sharedNumbers: total.rows[0].numbers_shared, top: rows };
}

export async function relinkAll() {
  return withTransaction((client) => autolink(client, null));
}
