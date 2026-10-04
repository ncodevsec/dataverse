import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as a from '../controllers/adminController.js';
import * as contacts from '../controllers/contactController.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { idParam, uuidParam, userListQuery, adminUserCreateSchema, adminUserUpdateSchema, adminResetPasswordSchema, siteSettingsSchema, auditQuery } from '../utils/schemas.js';

// Every route in this router requires an authenticated ADMIN - enforced here on the server, regardless of what the UI shows.
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/stats', a.stats);
adminRouter.get('/system', a.system);

adminRouter.get('/users', validate({ query: userListQuery }), a.listUsers);
adminRouter.post('/users', validate({ body: adminUserCreateSchema }), a.createUser);
adminRouter.get('/users/:id', validate({ params: uuidParam }), a.getUser);
adminRouter.patch('/users/:id', validate({ params: uuidParam, body: adminUserUpdateSchema }), a.updateUser);
adminRouter.post('/users/:id/approve', validate({ params: uuidParam }), a.approveUser);
adminRouter.post('/users/:id/reject', validate({ params: uuidParam }), a.rejectUser);
adminRouter.delete('/users/:id', validate({ params: uuidParam }), a.deleteUser);
adminRouter.post('/users/:id/reset-password', validate({ params: uuidParam, body: adminResetPasswordSchema }), a.resetUserPassword);

adminRouter.get('/settings', a.getSiteSettings);
adminRouter.put('/settings', validate({ body: siteSettingsSchema }), a.putSiteSettings);

adminRouter.get('/audit-logs', validate({ query: auditQuery }), a.listAudit);
adminRouter.get('/audit-logs/actions', a.auditActions);

adminRouter.get('/contacts/duplicates', contacts.duplicates);
adminRouter.post('/contacts/relink', contacts.relink);
adminRouter.delete('/contacts/phonebook/:id', validate({ params: idParam }), contacts.bulkDelete);

// Full export (database + images) as one date/time-stamped ZIP. Admin only, audited, and rate limited.
adminRouter.get('/backup', rateLimit({ name: 'backup', windowMs: 60 * 60 * 1000, max: 5, keyFn: (req) => req.user?.id }), a.downloadBackup);
