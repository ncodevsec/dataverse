/** Public shape of a user row. Password hashes and reset tokens are never selected or serialised. */
export const serializeUser = (u) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  displayName: u.display_name,
  role: u.role,
  isActive: u.is_active,
  approvalStatus: u.approval_status,
  mustChangePassword: u.must_change_password,
  peopleId: u.people_id,
  theme: u.theme,
  preferences: u.preferences || {},
  lastLoginAt: u.last_login_at ?? null,
  createdAt: u.created_at,
  ...(u.people_name !== undefined ? { peopleName: u.people_name } : {}),
});

export const USER_COLUMNS = `id, email, username, display_name, role, is_active, must_change_password, token_version, approval_status,
  people_id, theme, preferences, last_login_at, created_at`;
