import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// ------------------------------------------------------------------ toasts
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((type, message) => {
    const id = nextId.current++;
    setItems((l) => [...l.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000);
  }, [dismiss]);
  const api_ = useMemo(() => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }), [push]);
  return (
    <ToastCtx.Provider value={api_}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            t.type === 'error' ? 'border-danger/40 bg-surface text-ink' : 'border-line bg-surface text-ink'}`}>
            <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.type === 'error' ? 'bg-danger' : 'bg-accent'}`} />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ site settings (public)
const SiteCtx = createContext({ siteName: 'Dataverse', siteDescription: '', registrationEnabled: true, defaultTheme: 'system' });
export const useSite = () => useContext(SiteCtx);

export function SiteProvider({ children }) {
  const [site, setSite] = useState({ siteName: 'Dataverse', siteDescription: '', registrationEnabled: true, defaultTheme: 'system' });
  const reload = useCallback(() => api.get('/settings/public').then((d) => setSite(d.settings)).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  return <SiteCtx.Provider value={useMemo(() => ({ ...site, reload }), [site, reload])}>{children}</SiteCtx.Provider>;
}

// ------------------------------------------------------------------ auth
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('dv:unauthorized', onUnauthorized);
    return () => window.removeEventListener('dv:unauthorized', onUnauthorized);
  }, []);

  const value = useMemo(() => ({
    user, loading, isAdmin: user?.role === 'ADMIN', setUser,
    login: async (identifier, password) => { const d = await api.post('/auth/login', { identifier, password }); setUser(d.user); return d.user; },
    register: async (payload) => { const d = await api.post('/auth/register', payload); setUser(d.user); return d.user; },
    logout: async () => { try { await api.post('/auth/logout'); } finally { setUser(null); } },
  }), [user, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// ------------------------------------------------------------------ theme
const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [pref, setPref] = useState(() => localStorage.getItem('dv-theme') || 'system');
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const apply = () => {
      const isDark = pref === 'dark' || (pref === 'system' && systemDark());
      document.documentElement.classList.toggle('dark', isDark);
      setDark(isDark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);

  // adopt the account's saved theme when someone signs in on a new device
  const lastUserId = useRef(null);
  useEffect(() => {
    if (user && user.id !== lastUserId.current) {
      lastUserId.current = user.id;
      if (user.theme && user.theme !== pref) { setPref(user.theme); localStorage.setItem('dv-theme', user.theme); }
    }
    if (!user) lastUserId.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const setTheme = useCallback((next) => {
    setPref(next);
    localStorage.setItem('dv-theme', next);
    if (user) api.patch('/me', { theme: next }).catch(() => {});
  }, [user]);

  return <ThemeCtx.Provider value={useMemo(() => ({ theme: pref, dark, setTheme }), [pref, dark, setTheme])}>{children}</ThemeCtx.Provider>;
}
