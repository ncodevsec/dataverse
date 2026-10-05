import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, notFound, badRequest } from '../utils/httpError.js';
import * as svc from '../services/profileService.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { query } from '../db/pool.js';

const isAdmin = (u) => u.role === 'ADMIN';

async function loadOr404(id) {
  const row = await svc.getProfileRow(id);
  if (!row) throw notFound('Profile not found');
  return row;
}

export const list = asyncHandler(async (req, res) => {
  const { items, total } = await svc.searchProfiles(req.valid.query);
  const { page, limit } = req.valid.query;
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const options = asyncHandler(async (req, res) => {
  res.json({ items: await svc.lookupProfiles(req.valid.query.q, req.valid.query.limit, req.valid.query.entityType) });
});

export const facets = asyncHandler(async (_req, res) => {
  const [d, t] = await Promise.all([
    query(`SELECT district AS value, count(*)::int AS count FROM profiles WHERE district IS NOT NULL AND district <> ''
            GROUP BY district ORDER BY count(*) DESC, district LIMIT 100`),
    query(`SELECT tag AS value, count(*)::int AS count FROM profiles, unnest(tags) AS tag GROUP BY tag ORDER BY count(*) DESC, tag LIMIT 60`),
  ]);
  res.json({ districts: d.rows, tags: t.rows });
});

export const get = asyncHandler(async (req, res) => {
  res.json(await svc.getProfile(req.valid.params.id, req.user));
});

export const getFamily = asyncHandler(async (req, res) => {
  res.json(await svc.getFamily(req.valid.params.id));
});

export const create = asyncHandler(async (req, res) => {
  if (!isAdmin(req.user) && !(await getSettings()).allow_user_contributions) throw forbidden('Adding profiles is limited to administrators right now');
  const id = await svc.createProfile(req.valid.body, req.user);
  await audit(req, 'profile.create', { entityType: 'profile', entityId: id, summary: `Created profile "${req.valid.body.name}"` });
  res.status(201).json(await svc.getProfile(id, req.user));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditProfile(req.user, existing)) throw forbidden('You can only edit profiles you created or that are linked to your account');
  const { changed, previousName } = await svc.updateProfile(id, req.valid.body, req.user);
  await audit(req, 'profile.update', { entityType: 'profile', entityId: id, summary: `Updated profile "${previousName}"`, details: { fields: changed } });
  res.json(await svc.getProfile(id, req.user));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canDeleteProfile(req.user, existing)) throw forbidden('Only administrators or the person who created a profile can delete it');
  const deleted = await svc.deleteProfile(id);
  await audit(req, 'profile.delete', { entityType: 'profile', entityId: id, summary: `Deleted profile "${deleted.name}"` });
  res.status(204).end();
});

// ---------------------------------------------------------------- photos
export const getPhoto = asyncHandler(async (req, res) => {
  const photo = await svc.getPhoto(req.valid.params.id);
  if (!photo) throw notFound('No photo');
  res.set({ 'Content-Type': photo.content_type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  res.send(photo.data);
});

export const putPhoto = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditProfile(req.user, existing)) throw forbidden('You cannot change this profile\'s photo');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Send the image as the raw request body (image/jpeg, image/png or image/webp)');
  await svc.setPhoto(id, req.body);
  await audit(req, 'profile.photo', { entityType: 'profile', entityId: id, summary: `Changed photo of "${existing.name}"` });
  res.json(await svc.getProfile(id, req.user));
});

export const removePhoto = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditProfile(req.user, existing)) throw forbidden('You cannot change this profile\'s photo');
  await svc.deletePhoto(id);
  res.status(204).end();
});
