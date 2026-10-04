import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError, conflict, forbidden, unauthorized, badRequest } from '../utils/httpError.js';
import { hashPassword, verifyPassword, DUMMY_HASH, randomToken, sha256 } from '../utils/password.js';
import { signToken, setSessionCookie, clearSessionCookie } from '../utils/jwt.js';
import { serializeUser, USER_COLUMNS } from '../services/userService.js';
import { getSettings } from '../services/settings.js';
import { sendMail } from '../services/mailer.js';
import { config } from '../config.js';

const startSession = (res, user) => {
  const token = signToken(user);
  setSessionCookie(res, token);
  return token;
};

export const register = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  if (!settings.registration_enabled) throw forbidden('Registration is currently disabled');
  const { displayName, username, email, password } = req.valid.body;
  const hash = await hashPassword(password);
  // Role is NEVER taken from the request: public sign-ups are always USER, and always start PENDING.
  // No session is issued: the account cannot see any data until an administrator approves it.
  await query(
    `INSERT INTO users (email, username, display_name, password_hash, role, theme, approval_status)
     VALUES ($1, $2, $3, $4, 'USER', $5, 'PENDING')`,
    [email, username, displayName, hash, settings.default_theme],
  );
  res.status(201).json({ pending: true, message: 'Your account was created and is waiting for administrator approval. You will be able to sign in once it is approved.' });
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.valid.body;
  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($1) LIMIT 1`,
    [identifier],
  );
  const found = rows[0];
  // Always run bcrypt so response time does not reveal whether the account exists.
  const ok = await verifyPassword(password, found?.password_hash ?? DUMMY_HASH);
  if (!found || !ok) throw unauthorized('Incorrect email/username or password');
  if (!found.is_active) throw forbidden('This account has been deactivated. Contact an administrator.');
  // Status is only revealed after the password was verified, so it cannot be used to probe for accounts.
  if (found.approval_status === 'PENDING') throw new HttpError(403, 'Your account is waiting for administrator approval.', { code: 'ACCOUNT_PENDING' });
  if (found.approval_status !== 'APPROVED') throw new HttpError(403, 'Your registration was not approved. Contact an administrator.', { code: 'ACCOUNT_REJECTED' });

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [found.id]);
  const token = startSession(res, found);
  res.json({ user: serializeUser(found), token });
});

export const logout = (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
};

export const me = (req, res) => {
  if (!req.user) throw unauthorized();
  res.json({ user: serializeUser(req.user) });
};

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.valid.body;
  const { rows } = await query(`SELECT id, email, display_name FROM users WHERE lower(email) = $1 AND is_active AND approval_status = 'APPROVED'`, [email]);
  const user = rows[0];
  if (user) {
    const token = randomToken();
    await query(
      `UPDATE users SET reset_token_hash = $2, reset_token_expires_at = now() + interval '1 hour' WHERE id = $1`,
      [user.id, sha256(token)],
    );
    const link = `${config.siteUrl}/reset-password?token=${token}`;
    try {
      await sendMail({
        to: user.email,
        subject: 'Reset your Dataverse password',
        text: `Hi ${user.display_name},\n\nUse this link within one hour to choose a new password:\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
      });
    } catch (err) {
      console.error('[auth] could not send reset email:', err.message);
    }
  }
  // Same answer whether or not the account exists (prevents account enumeration).
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.valid.body;
  const hash = await hashPassword(password);
  const { rows } = await query(
    `UPDATE users SET password_hash = $2, reset_token_hash = NULL, reset_token_expires_at = NULL,
            must_change_password = false, token_version = token_version + 1
      WHERE reset_token_hash = $1 AND reset_token_expires_at > now() AND is_active AND approval_status = 'APPROVED'
      RETURNING id, email, display_name`,
    [sha256(token), hash],
  );
  if (!rows.length) throw badRequest('This reset link is invalid or has expired. Request a new one.');
  res.json({ message: 'Password updated. You can now sign in.' });
});

// ---------- the signed-in user's own account ----------
export const updateAccount = asyncHandler(async (req, res) => {
  const { displayName, username, email, theme, preferences } = req.valid.body;
  const sets = [];
  const vals = [req.user.id];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (displayName !== undefined) add('display_name', displayName);
  if (username !== undefined) add('username', username);
  if (email !== undefined) add('email', email);
  if (theme !== undefined) add('theme', theme);
  if (preferences !== undefined) { vals.push(JSON.stringify({ ...(req.user.preferences || {}), ...preferences })); sets.push(`preferences = $${vals.length}::jsonb`); }
  if (!sets.length) return res.json({ user: serializeUser(req.user) });
  const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${USER_COLUMNS}`, vals);
  res.json({ user: serializeUser(rows[0]) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw badRequest('Your current password is incorrect', { currentPassword: 'Incorrect password' });
  }
  if (currentPassword === newPassword) throw conflict('Choose a password you have not used just now', { newPassword: 'Must be different' });
  const hash = await hashPassword(newPassword);
  const upd = await query(
    `UPDATE users SET password_hash = $2, must_change_password = false, token_version = token_version + 1
      WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [req.user.id, hash],
  );
  // Other sessions are now invalid; keep this one signed in.
  startSession(res, upd.rows[0]);
  res.json({ user: serializeUser(upd.rows[0]), message: 'Password changed' });
});
