import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { query } from '../db/pool.js';
import * as svc from '../services/orgService.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';

const isAdmin = (u) => u.role === 'ADMIN';
async function loadOr404(id) {
  const row = await svc.getOrgRow(id);
  if (!row) throw notFound('Organization not found');
  return row;
}

export const list = asyncHandler(async (req, res) => {
  const { items, total } = await svc.searchOrgs(req.valid.query);
  const { page, limit } = req.valid.query;
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});
export const options = asyncHandler(async (req, res) => res.json({ items: await svc.lookupOrgs(req.valid.query.q, req.valid.query.limit) }));
export const facets = asyncHandler(async (_req, res) => {
  const [t, ty] = await Promise.all([
    query('SELECT tag AS value, count(*)::int AS count FROM organizations, unnest(tags) AS tag GROUP BY tag ORDER BY count(*) DESC, tag LIMIT 60'),
    query('SELECT org_type AS value, count(*)::int AS count FROM organizations GROUP BY org_type ORDER BY count(*) DESC'),
  ]);
  res.json({ tags: t.rows, types: ty.rows });
});
export const get = asyncHandler(async (req, res) => res.json(await svc.getOrg(req.valid.params.id, req.user)));

export const create = asyncHandler(async (req, res) => {
  if (!isAdmin(req.user) && !(await getSettings()).allow_user_contributions) throw forbidden('Adding organizations is limited to administrators right now');
  const id = await svc.createOrg(req.valid.body, req.user.id);
  await audit(req, 'organization.create', { entityType: 'organization', entityId: id, summary: `Created organization "${req.valid.body.name}"`, details: { orgType: req.valid.body.orgType } });
  res.status(201).json(await svc.getOrg(id, req.user));
});
export const update = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditOrg(req.user, existing)) throw forbidden('You can only edit organizations you created');
  const { changed, previousName } = await svc.updateOrg(id, req.valid.body, req.user.id);
  await audit(req, 'organization.update', { entityType: 'organization', entityId: id, summary: `Updated organization "${previousName}"`, details: { fields: changed } });
  res.json(await svc.getOrg(id, req.user));
});
export const remove = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canDeleteOrg(req.user, existing)) throw forbidden('Only administrators or the person who created an organization can delete it');
  const deleted = await svc.deleteOrg(id);
  await audit(req, 'organization.delete', { entityType: 'organization', entityId: id, summary: `Deleted organization "${deleted.name}"` });
  res.status(204).end();
});

export const getPhoto = asyncHandler(async (req, res) => {
  const photo = await svc.getOrgPhoto(req.valid.params.id);
  if (!photo) throw notFound('No logo');
  res.set({ 'Content-Type': photo.content_type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  res.send(photo.data);
});
export const putPhoto = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditOrg(req.user, existing)) throw forbidden("You cannot change this organization's logo");
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Send the image as the raw request body (image/jpeg, image/png or image/webp)');
  await svc.setOrgPhoto(id, req.body);
  await audit(req, 'organization.photo', { entityType: 'organization', entityId: id, summary: `Changed logo of "${existing.name}"` });
  res.json(await svc.getOrg(id, req.user));
});
export const removePhoto = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const existing = await loadOr404(id);
  if (!svc.canEditOrg(req.user, existing)) throw forbidden("You cannot change this organization's logo");
  await svc.deleteOrgPhoto(id);
  res.status(204).end();
});
