import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import * as c from '../controllers/authController.js';
import { registerSchema, loginSchema, forgotSchema, resetSchema, accountUpdateSchema, changePasswordSchema } from '../utils/schemas.js';

const MIN = 60 * 1000;
const ident = (req) => (req.body?.identifier || req.body?.email || '').toString().toLowerCase().slice(0, 254) || null;

export const authRouter = Router();

authRouter.post('/register', rateLimit({ name: 'register', windowMs: 60 * MIN, max: 10 }), validate({ body: registerSchema }), c.register);
authRouter.post('/login',
  rateLimit({ name: 'login-ip', windowMs: 15 * MIN, max: 30 }),
  rateLimit({ name: 'login-id', windowMs: 15 * MIN, max: 8, keyFn: ident, message: 'Too many sign-in attempts for this account. Try again in a few minutes.' }),
  validate({ body: loginSchema }), c.login);
authRouter.post('/logout', c.logout);
authRouter.post('/forgot-password',
  rateLimit({ name: 'forgot-ip', windowMs: 60 * MIN, max: 10 }),
  rateLimit({ name: 'forgot-id', windowMs: 60 * MIN, max: 3, keyFn: ident }),
  validate({ body: forgotSchema }), c.forgotPassword);
authRouter.post('/reset-password', rateLimit({ name: 'reset', windowMs: 60 * MIN, max: 10 }), validate({ body: resetSchema }), c.resetPassword);
authRouter.get('/me', requireAuth, c.me);

// the signed-in user's own account (mounted at /api/me)
export const meRouter = Router();
meRouter.patch('/', validate({ body: accountUpdateSchema }), c.updateAccount);
meRouter.put('/password', rateLimit({ name: 'pwchange', windowMs: 15 * MIN, max: 10, keyFn: (req) => req.user?.id }), validate({ body: changePasswordSchema }), c.changePassword);
