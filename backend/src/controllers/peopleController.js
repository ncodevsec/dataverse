import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, notFound, badRequest } from '../utils/httpError.js';
import * as svc from '../services/peopleService.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { query } from '../db/pool.js';

const isAdmin = (u) => u.role === 'ADMIN';

async function loadOr404(id) {
  const row = await svc.getPeopleRow(id);
  if (!row) throw notFound('People not found');
  return row;
}

export const list = asyncHandler(async (req, res) => {
  const { items, total } = await svc.searchPeoples(req.valid.query);
  const { page, limit } = req.valid.query;
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const options = asyncHandler(async (req, res) => {
  res.json({ items: await svc.lookupPeoples(req.valid.query.q, req.valid.query.limit) });
});

export const facets = asyncHandler(async (_req, res) => {
  const [d, t] = await Promise.all([
    query(`SELECT district AS value, count(*)::int AS count FROM peoples WHERE district IS NOT NULL AND district <> ''
            GROUP BY district ORDER BY count(*) DESC, district LIMIT 100`),
    query(`SELECT tag AS value, count(*)::int AS count FROM peoples, unnest(tags) AS tag GROUP BY tag ORDER BY count(*) DESC, tag LIMIT 60`),
  ]);
  res.json({ districts: d.rows, tags: t.rows });
});

export const get = asyncHandler(async (req, res) => {
  res.json(await svc.getPeople(req.valid.params.id, req.user));
});

export const getFamily = asyncHandler(async (req, res) => {
  res.json(await svc.getFamily(req.valid.params.id));
});

export const create = asyncHandler(async (req, res) => {
  if (!isAdmin(req.user) && !(await getSettings()).allow_user_contributions) throw forbidden('Adding peoples is limited to administrators right now');
  const id = await svc.createPeople(req.valid.body, req.user);
  await audit(req, 'people.create', { entityType: 'people', entityId: id, summary: `Created people "${req.valid.body.name}"` });
  res.status(201).json(await svc.getPeople(id, req.user));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditPeople(req.user, existing)) throw forbidden('You can only edit peoples you created or that are linked to your account');
  const { changed, previousName } = await svc.updatePeople(id, req.valid.body, req.user);
  await audit(req, 'people.update', { entityType: 'people', entityId: id, summary: `Updated people "${previousName}"`, details: { fields: changed } });
  res.json(await svc.getPeople(id, req.user));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canDeletePeople(req.user, existing)) throw forbidden('Only administrators or the person who created a people can delete it');
  const deleted = await svc.deletePeople(id);
  await audit(req, 'people.delete', { entityType: 'people', entityId: id, summary: `Deleted people "${deleted.name}"` });
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
  if (!svc.canEditPeople(req.user, existing)) throw forbidden('You cannot change this people\'s photo');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Send the image as the raw request body (image/jpeg, image/png or image/webp)');
  await svc.setPhoto(id, req.body);
  await audit(req, 'people.photo', { entityType: 'people', entityId: id, summary: `Changed photo of "${existing.name}"` });
  res.json(await svc.getPeople(id, req.user));
});

export const removePhoto = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditPeople(req.user, existing)) throw forbidden('You cannot change this people\'s photo');
  await svc.deletePhoto(id);
  res.status(204).end();
});
