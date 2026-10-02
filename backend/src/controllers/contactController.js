import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, notFound } from '../utils/httpError.js';
import * as svc from '../services/callerService.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { query } from '../db/pool.js';

const isAdmin = (u) => u.role === 'ADMIN';
const canChange = (u, row) => isAdmin(u) || row.created_by === u.id;

async function contributionsAllowed(user) {
  if (isAdmin(user)) return;
  if (!(await getSettings()).allow_user_contributions) throw forbidden('Adding contacts is limited to administrators right now');
}

export const list = asyncHandler(async (req, res) => {
  const { items, total } = await svc.searchContacts(req.valid.query, req.user);
  const { page, limit } = req.valid.query;
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const relatives = asyncHandler(async (_req, res) => res.json({ items: await svc.listRelatives() }));

export const create = asyncHandler(async (req, res) => {
  await contributionsAllowed(req.user);
  const id = await svc.createContact(req.valid.body, req.user.id);
  await audit(req, 'contact.create', { entityType: 'contact', entityId: id, summary: `Added contact "${req.valid.body.name}"` });
  res.status(201).json({ item: await svc.getContact(id, req.user) });
});

export const update = asyncHandler(async (req, res) => {
  const row = await svc.getContactRow(req.valid.params.id);
  if (!row) throw notFound('Contact not found');
  if (!canChange(req.user, row)) throw forbidden('You can only edit contacts you added');
  await svc.updateContact(row.id, req.valid.body);
  await audit(req, 'contact.update', { entityType: 'contact', entityId: row.id, summary: `Updated contact "${row.name}"`, details: { fields: Object.keys(req.valid.body) } });
  res.json({ ok: true });
});

export const remove = asyncHandler(async (req, res) => {
  const row = await svc.getContactRow(req.valid.params.id);
  if (!row) throw notFound('Contact not found');
  if (!canChange(req.user, row)) throw forbidden('You can only delete contacts you added');
  await svc.deleteContact(row.id);
  await audit(req, 'contact.delete', { entityType: 'contact', entityId: row.id, summary: `Deleted contact "${row.name}" (${row.number})` });
  res.status(204).end();
});

export const importVcf = asyncHandler(async (req, res) => {
  await contributionsAllowed(req.user);
  const result = await svc.importVcf(req.valid.body, req.user.id);
  await audit(req, 'contact.import', { entityType: 'contact', summary: `Imported ${result.inserted} contacts from a vCard file`, details: { connectionId: req.valid.body.connectionId, ...result } });
  res.status(201).json(result);
});

// admin tools
export const duplicates = asyncHandler(async (_req, res) => res.json(await svc.duplicateReport()));

export const relink = asyncHandler(async (req, res) => {
  const linked = await svc.relinkAll();
  await audit(req, 'contact.relink', { entityType: 'contact', summary: `Linked ${linked} contacts to profiles by phone number` });
  res.json({ linked });
});

export const bulkDelete = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM caller_contacts WHERE connection_id = $1', [req.valid.params.id]);
  await audit(req, 'contact.bulk_delete', { entityType: 'profile', entityId: req.valid.params.id, summary: `Deleted all ${rowCount} contacts of phonebook ${req.valid.params.id}` });
  res.json({ deleted: rowCount });
});
