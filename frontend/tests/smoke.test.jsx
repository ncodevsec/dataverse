// Integration smoke test: renders every page against a RUNNING API (default http://localhost:3001) seeded with data.
// Run:  npm run dev -w backend   (in one terminal)   then   npm test -w frontend
// Skipped automatically when the API is not reachable.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider, SiteProvider, ThemeProvider, ToastProvider } from '../src/context/AppContext.jsx';

const ADMIN = { identifier: process.env.TEST_ADMIN || 'admin', password: process.env.TEST_ADMIN_PASSWORD || 'Admin-Passw0rd-123' };
let cookie = '';
let apiUp = false;

// node's fetch has no cookie jar; emulate the browser's for the HttpOnly session cookie
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const headers = { ...(opts.headers || {}), ...(cookie ? { Cookie: cookie } : {}) };
  const res = await realFetch(url, { ...opts, headers });
  const set = res.headers.getSetCookie?.() || [];
  const session = set.find((c) => c.startsWith('dv_session='));
  if (session) cookie = session.split(';')[0];
  return res;
};

beforeAll(async () => {
  try {
    const res = await fetch('http://localhost:3001/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dataverse' }, body: JSON.stringify(ADMIN) });
    apiUp = res.ok;
  } catch { apiUp = false; }
  window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
});

const mount = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <SiteProvider><AuthProvider><ThemeProvider><ToastProvider><App /></ToastProvider></ThemeProvider></AuthProvider></SiteProvider>
  </MemoryRouter>,
);

const PAGES = [
  ['/', /Recently added/],
  ['/profiles', /Add profile/],
  ['/profiles/59', /Personal information/],
  ['/profiles/59/edit', /Save changes/],
  ['/profiles/new', /Create profile/],
  ['/shekor', /Pick a person to see/],
  ['/shekor/59', /বংশানুক্রম/],
  ['/caller-id', /Add contact/],
  ['/search?q=ali', /Contacts/],
  ['/settings', /Display name/],
  ['/admin', /Newest accounts/],
  ['/admin/users', /Create user/],
  ['/admin/profiles', /Add profile/],
  ['/admin/contacts', /Tools/],
  ['/admin/audit', /Action|No activity/],
  ['/admin/settings', /Site name/],
];

describe('pages render against the live API', () => {
  for (const [path, expected] of PAGES) {
    it(path, async (ctx) => {
      if (!apiUp) return ctx.skip();
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      mount(path);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 15000 });
      expect(screen.queryByText(/We couldn't load this/)).toBeNull();
      const bad = errors.mock.calls.filter((c) => !String(c[0]).includes('not wrapped in act'));
      errors.mockRestore();
      expect(bad, bad.map((c) => String(c[0]).slice(0, 200)).join('\n')).toHaveLength(0);
      cleanup();
    });
  }
});
