import { query, withTransaction } from '../db/pool.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { digitsOnly, escapeLike } from '../utils/phone.js';
import { SOCIAL_NETWORKS } from '../utils/schemas.js';
import { sniffImageType } from './profileService.js';

const isAdmin = (u) => u?.role === 'ADMIN';
export const canEditOrg = (u, o) => !!u && (isAdmin(u) || o.created_by === u.id);
export const canDeleteOrg = canEditOrg;

export const FIELD_COLUMNS = {
  orgType: 'org_type', name: 'name', shortName: 'short_name', email: 'email', phone: 'phone', website: 'website',
  foundedOn: 'founded_on', dissolvedOn: 'dissolved_on', street: 'street', unionName: 'union_name', subDistrict: 'sub_district',
  district: 'district', state: 'state', zip: 'zip', country: 'country', presentStreet: 'present_street', presentCity: 'present_city',
  socialLinks: 'social_links', about: 'about', tags: 'tags',
};

const logoUrl = (r) => (r.photo_updated_at ? `/api/organizations/${r.id}/photo?v=${new Date(r.photo_updated_at).getTime()}` : null);
export const ORG_SUMMARY_COLUMNS = `o.id, o.org_type, o.name, o.short_name, o.district, o.phone, o.website, o.founded_on, o.dissolved_on, o.tags, o.photo_updated_at, o.created_at`;
export const toOrgSummary = (r) => ({
  id: r.id, orgType: r.org_type, name: r.name, shortName: r.short_name, district: r.district, phone: r.phone, website: r.website,
  foundedOn: r.founded_on, dissolvedOn: r.dissolved_on, tags: r.tags || [], photoUrl: logoUrl(r),
});
const normalizeSocial = (v) => Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, Array.isArray(v?.[n]) ? v[n] : []]));

export const toOrgFull = (r, viewer) => ({
  ...toOrgSummary(r),
  email: r.email, street: r.street, unionName: r.union_name, subDistrict: r.sub_district, state: r.state, zip: r.zip, country: r.country,
  presentStreet: r.present_street, presentCity: r.present_city, socialLinks: normalizeSocial(r.social_links), about: r.about,
  createdAt: r.created_at, updatedAt: r.updated_at,
  permissions: { canEdit: canEditOrg(viewer, r), canDelete: canDeleteOrg(viewer, r) },
});

export async function getOrgRow(id, client = { query }) {
  const { rows } = await client.query('SELECT * FROM organizations WHERE id = $1', [id]);
  return rows[0] || null;
}
export async function getOrg(id, viewer) {
  const row = await getOrgRow(id);
  if (!row) throw notFound('Organization not found');
  return { organization: toOrgFull(row, viewer) };
}

export async function searchOrgs(f) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  let rank = '';
  if (f.q) {
    for (const t of f.q.split(/\s+/).filter(Boolean).slice(0, 6)) {
      const like = p(`%${escapeLike(t)}%`);
      const parts = [`o.name ILIKE ${like}`, `o.short_name ILIKE ${like}`, `o.email ILIKE ${like}`, `o.website ILIKE ${like}`];
      const d = digitsOnly(t);
      if (d.length >= 3 && /^[\d\s+\-()]+$/.test(t)) parts.push(`o.phone_digits LIKE ${p(`%${d}%`)}`);
      if (/^\d{1,9}$/.test(t)) parts.push(`o.id = ${p(Number(t))}`);
      where.push(`(${parts.join(' OR ')})`);
    }
    rank = `(lower(o.name) = lower(${p(f.q)})) DESC, (o.name ILIKE ${p(`${escapeLike(f.q)}%`)}) DESC, `;
  }
  if (f.orgType) where.push(`o.org_type = ${p(f.orgType)}`);
  if (f.tag) where.push(`${p(f.tag)} = ANY(o.tags)`);
  const order = { name: `${rank}lower(o.name), o.id`, newest: `${rank}o.created_at DESC, o.id DESC`, oldest: `${rank}o.created_at ASC, o.id ASC` }[f.sort || 'newest'];
  const limit = f.limit || 20;
  const { rows } = await query(
    `SELECT ${ORG_SUMMARY_COLUMNS}, count(*) OVER() AS total FROM organizations o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${order} LIMIT ${p(limit)} OFFSET ${p(((f.page || 1) - 1) * limit)}`, params);
  return { items: rows.map(toOrgSummary), total: rows[0]?.total ?? 0 };
}
export async function lookupOrgs(q, limit = 8) {
  return (await searchOrgs({ q, page: 1, limit, sort: 'name' })).items;
}

function validateDates(current, data) {
  const from = data.foundedOn !== undefined ? data.foundedOn : current?.founded_on;
  const to = data.dissolvedOn !== undefined ? data.dissolvedOn : current?.dissolved_on;
  if (from && to && to < from) throw badRequest('The end date cannot be before the founding date', { dissolvedOn: 'Cannot be before the founding date' });
}
const val = (key, v) => (key === 'socialLinks' ? JSON.stringify(v) : v);

export async function createOrg(data, userId) {
  validateDates(null, data);
  const cols = ['created_by', 'updated_by'];
  const vals = [userId, userId];
  for (const [key, col] of Object.entries(FIELD_COLUMNS)) if (data[key] !== undefined) { cols.push(col); vals.push(val(key, data[key])); }
  const { rows } = await query(`INSERT INTO organizations (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
  return rows[0].id;
}

export async function updateOrg(id, data, userId) {
  return withTransaction(async (client) => {
    const current = (await client.query('SELECT * FROM organizations WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw notFound('Organization not found');
    validateDates(current, data);
    const sets = ['updated_by = $2'];
    const vals = [id, userId];
    const changed = [];
    for (const [key, col] of Object.entries(FIELD_COLUMNS)) {
      if (data[key] === undefined) continue;
      vals.push(val(key, data[key])); sets.push(`${col} = $${vals.length}`); changed.push(key);
    }
    await client.query(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $1`, vals);
    return { changed, previousName: current.name };
  });
}

export async function deleteOrg(id) {
  const { rows } = await query('DELETE FROM organizations WHERE id = $1 RETURNING id, name', [id]);
  if (!rows.length) throw notFound('Organization not found');
  return rows[0];
}

// ---- logo
export async function setOrgPhoto(id, buffer) {
  const type = sniffImageType(buffer);
  if (!type) throw badRequest('Upload a JPEG, PNG or WebP image');
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO organization_photos (organization_id, content_type, data, size_bytes) VALUES ($1,$2,$3,$4)
       ON CONFLICT (organization_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, size_bytes = EXCLUDED.size_bytes, updated_at = now()`,
      [id, type, buffer, buffer.length]);
    await client.query('UPDATE organizations SET photo_updated_at = now() WHERE id = $1', [id]);
  });
}
export async function getOrgPhoto(id) {
  const { rows } = await query('SELECT content_type, data FROM organization_photos WHERE organization_id = $1', [id]);
  return rows[0] || null;
}
export async function deleteOrgPhoto(id) {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM organization_photos WHERE organization_id = $1', [id]);
    await client.query('UPDATE organizations SET photo_updated_at = NULL WHERE id = $1', [id]);
  });
}
