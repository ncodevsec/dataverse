import { query } from '../db/pool.js';

const TTL_MS = 15_000;
let cache = { at: 0, value: null };

export const DEFAULTS = {
  site_name: 'Dataverse',
  site_description: 'Family profiles, generation trees and a shared contact directory.',
  registration_enabled: true,
  allow_user_contributions: true,
  default_theme: 'system',
  contact_email: '',
};

/** All settings as a flat object, cached briefly per instance (settings change rarely). */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const { rows } = await query('SELECT key, value FROM site_settings');
  const value = { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(patch, userId) {
  const before = await getSettings({ fresh: true });
  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    await query(
      `INSERT INTO site_settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), userId],
    );
    changes[key] = { from: before[key], to: value };
  }
  cache = { at: 0, value: null };
  return { settings: await getSettings({ fresh: true }), changes };
}

export const publicSettings = (s) => ({
  siteName: s.site_name,
  siteDescription: s.site_description,
  registrationEnabled: s.registration_enabled,
  defaultTheme: s.default_theme,
});
