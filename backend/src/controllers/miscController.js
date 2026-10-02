import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../db/pool.js';
import { getSettings, publicSettings } from '../services/settings.js';
import { lookupProfiles } from '../services/profileService.js';
import { searchContacts } from '../services/callerService.js';
import { getTree } from '../services/treeService.js';

export const publicSiteSettings = asyncHandler(async (_req, res) => res.json({ settings: publicSettings(await getSettings()) }));

export const health = (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() });
export const healthDb = asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', database: 'up' });
});

export const search = asyncHandler(async (req, res) => {
  const { q, limit } = req.valid.query;
  const [profiles, contacts] = await Promise.all([
    lookupProfiles(q, limit),
    searchContacts({ q, page: 1, limit, sort: 'name' }, req.user),
  ]);
  res.json({ q, profiles, contacts: contacts.items, contactsTotal: contacts.total });
});

export const tree = asyncHandler(async (req, res) => {
  res.json(await getTree(req.valid.params.id, req.valid.query));
});

export const dashboard = asyncHandler(async (_req, res) => {
  const [totals, recent] = await Promise.all([
    query(`SELECT (SELECT count(*) FROM profiles)::int AS profiles, (SELECT count(*) FROM caller_contacts)::int AS contacts,
                  (SELECT count(*) FROM profiles WHERE father_id IS NOT NULL OR mother_id IS NOT NULL)::int AS connected`),
    query(`SELECT p.id, p.name, p.nickname, p.gender, p.occupation, p.district, p.photo_updated_at FROM profiles p ORDER BY p.created_at DESC, p.id DESC LIMIT 6`),
  ]);
  res.json({
    totals: totals.rows[0],
    recent: recent.rows.map((r) => ({ id: r.id, name: r.name, nickname: r.nickname, gender: r.gender, occupation: r.occupation, district: r.district,
      photoUrl: r.photo_updated_at ? `/api/profiles/${r.id}/photo?v=${new Date(r.photo_updated_at).getTime()}` : null })),
  });
});
