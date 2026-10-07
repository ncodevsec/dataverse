import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authRouter, meRouter } from './auth.js';
import { profilesRouter, postsRouter } from './profiles.js';
import { contactsRouter } from './contacts.js';
import { adminRouter } from './admin.js';
import * as links from '../controllers/linkController.js';
import * as misc from '../controllers/miscController.js';
import { idParam, searchQuery, treeQuery, membershipCreateSchema, orgLinkCreateSchema, linkUpdateSchema } from '../utils/schemas.js';
import { organizationsRouter } from './organizations.js';

export const api = Router();

// ---- public
api.get('/health', misc.health);
api.get('/health/db', misc.healthDb);
api.get('/settings/public', misc.publicSiteSettings);
api.use('/auth', authRouter);

// ---- everything below requires a signed-in user
api.use(requireAuth);
api.use('/me', meRouter);
api.get('/dashboard', misc.dashboard);
api.get('/search', validate({ query: searchQuery }), misc.search);
api.get('/tree/:id', validate({ params: idParam, query: treeQuery }), misc.tree);
api.get('/profiles/:id/memberships', validate({ params: idParam }), links.forHuman);
api.post('/memberships', validate({ body: membershipCreateSchema }), links.createMembership);
api.patch('/memberships/:id', validate({ params: idParam, body: linkUpdateSchema }), links.updateMembership);
api.delete('/memberships/:id', validate({ params: idParam }), links.removeMembership);
api.post('/org-links', validate({ body: orgLinkCreateSchema }), links.createOrgLink);
api.patch('/org-links/:id', validate({ params: idParam, body: linkUpdateSchema }), links.updateOrgLink);
api.delete('/org-links/:id', validate({ params: idParam }), links.removeOrgLink);
api.use('/organizations', organizationsRouter);
api.use('/profiles', profilesRouter);
api.use('/posts', postsRouter);
api.use('/contacts', contactsRouter);
api.use('/admin', adminRouter);
