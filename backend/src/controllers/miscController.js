import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../db/pool.js';
import { getSettings, publicSettings } from '../services/settings.js';
import { lookupPeoples } from '../services/peopleService.js';
import { lookupOrgs, INHERITED_LOGO_SQL } from '../services/orgService.js';
import { searchContacts } from '../services/callerService.js';
import { getTree } from '../services/treeService.js';
import { searchPosts } from './postController.js';
import { escapeLike } from '../utils/phone.js';

export const publicSiteSettings = asyncHandler(async (_req, res) => res.json({ settings: publicSettings(await getSettings()) }));

export const health = (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() });
export const healthDb = asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', database: 'up' });
});

export const search = asyncHandler(async (req, res) => {
  const { q, limit } = req.valid.query;
  const [peoples, organizations, posts, contacts] = await Promise.all([
    lookupPeoples(q, limit),
    lookupOrgs(q, limit),
    searchPosts(req.user, q, limit),
    searchContacts({ q, page: 1, limit, sort: 'name' }, req.user),
  ]);
  res.json({ q, peoples, organizations, posts, contacts: contacts.items, contactsTotal: contacts.total });
});

export const tree = asyncHandler(async (req, res) => {
  res.json(await getTree(req.valid.params.id, req.valid.query));
});

/** Top tags across people, organizations and visible posts; `prefix` narrows to tags starting with it (for the #-autocomplete). */
export const tags = asyncHandler(async (req, res) => {
  const { prefix, limit } = req.valid.query;
  const { rows } = await query(
    `SELECT tag AS value, count(*)::int AS count FROM (
        SELECT unnest(tags) AS tag FROM peoples
        UNION ALL SELECT unnest(tags) FROM organizations
        UNION ALL SELECT unnest(tags) FROM posts WHERE status = 'published' OR created_by = $2
     ) t WHERE tag LIKE $1 ESCAPE '\\' GROUP BY tag ORDER BY count(*) DESC, tag LIMIT $3`, [`${escapeLike(prefix)}%`, req.user.id, limit]);
  res.json({ items: rows });
});

export const dashboard = asyncHandler(async (req, res) => {
  const me = req.user.id;
  const [totals, recentPeoples, recentOrgs, recentPosts, daily, topTags, districts, orgTypes, mine, updated, pending] = await Promise.all([
    query(`SELECT (SELECT count(*) FROM peoples)::int AS peoples, (SELECT count(*) FROM organizations)::int AS organizations, (SELECT count(*) FROM caller_contacts)::int AS contacts,
                  (SELECT count(*) FROM posts WHERE status = 'published')::int AS posts, (SELECT count(*) FROM memberships)::int AS memberships,
                  (SELECT count(*) FROM peoples WHERE father_id IS NOT NULL OR mother_id IS NOT NULL)::int AS connected,
                  (SELECT count(*) FROM peoples WHERE created_at > now() - interval '7 days')::int AS peoples_week,
                  (SELECT count(*) FROM organizations WHERE created_at > now() - interval '7 days')::int AS organizations_week,
                  (SELECT count(*) FROM caller_contacts WHERE created_at > now() - interval '7 days')::int AS contacts_week`),
    query(`SELECT p.id, p.name, p.nickname, p.gender, p.occupation, p.district, p.photo_updated_at, p.created_at FROM peoples p ORDER BY p.created_at DESC, p.id DESC LIMIT 6`),
    query(`SELECT o.id, o.name, o.org_type, o.district, o.photo_updated_at, o.created_at, ${INHERITED_LOGO_SQL} FROM organizations o ORDER BY o.created_at DESC, o.id DESC LIMIT 6`),
    searchPosts(req.user, '', 5),
    query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
        (SELECT count(*) FROM peoples WHERE created_at::date = d::date)::int AS peoples,
        (SELECT count(*) FROM organizations WHERE created_at::date = d::date)::int AS organizations,
        (SELECT count(*) FROM caller_contacts WHERE created_at::date = d::date)::int AS contacts,
        (SELECT count(*) FROM posts WHERE created_at::date = d::date)::int AS posts
       FROM generate_series(current_date - 13, current_date, interval '1 day') AS d ORDER BY d`),
    query(`SELECT tag AS value, count(*)::int AS count FROM (SELECT unnest(tags) AS tag FROM peoples UNION ALL SELECT unnest(tags) FROM organizations
             UNION ALL SELECT unnest(tags) FROM posts WHERE status = 'published') t GROUP BY tag ORDER BY count(*) DESC, tag LIMIT 10`),
    query(`SELECT district AS value, count(*)::int AS count FROM peoples WHERE district IS NOT NULL AND district <> '' GROUP BY district ORDER BY count(*) DESC, district LIMIT 6`),
    query('SELECT org_type AS value, count(*)::int AS count FROM organizations GROUP BY org_type ORDER BY count(*) DESC'),
    query(`SELECT (SELECT count(*) FROM peoples WHERE created_by = $1)::int AS peoples, (SELECT count(*) FROM organizations WHERE created_by = $1)::int AS organizations,
                  (SELECT count(*) FROM posts WHERE created_by = $1)::int AS posts, (SELECT count(*) FROM caller_contacts WHERE created_by = $1)::int AS contacts`, [me]),
    query(`SELECT p.id, p.name, p.gender, p.photo_updated_at, p.updated_at FROM peoples p WHERE p.updated_at > p.created_at + interval '1 minute' ORDER BY p.updated_at DESC LIMIT 5`),
    req.user.role === 'ADMIN' ? query("SELECT count(*)::int AS n FROM users WHERE approval_status = 'PENDING'") : { rows: [{ n: 0 }] },
  ]);
  const photo = (kind, r) => (r.photo_updated_at ? `/api/${kind}/${r.id}/photo?v=${new Date(r.photo_updated_at).getTime()}` : null);
  const t = totals.rows[0];
  res.json({
    totals: { peoples: t.peoples, organizations: t.organizations, contacts: t.contacts, posts: t.posts, memberships: t.memberships, connected: t.connected,
      peoplesWeek: t.peoples_week, organizationsWeek: t.organizations_week, contactsWeek: t.contacts_week },
    recentPeoples: recentPeoples.rows.map((r) => ({ id: r.id, name: r.name, nickname: r.nickname, gender: r.gender, occupation: r.occupation, district: r.district, photoUrl: photo('peoples', r), createdAt: r.created_at })),
    recentOrganizations: recentOrgs.rows.map((r) => ({ id: r.id, name: r.name, orgType: r.org_type, district: r.district, createdAt: r.created_at,
      photoUrl: photo('organizations', r) || (r.inherited_logo ? `/api/organizations/${r.inherited_logo.split(':')[0]}/photo?v=${r.inherited_logo.split(':')[1]}` : null) })),
    recentPosts,
    recentlyUpdated: updated.rows.map((r) => ({ id: r.id, name: r.name, gender: r.gender, photoUrl: photo('peoples', r), updatedAt: r.updated_at })),
    daily: daily.rows, topTags: topTags.rows, districts: districts.rows, orgTypes: orgTypes.rows, mine: mine.rows[0],
    pendingUsers: pending.rows[0].n,
  });
});
