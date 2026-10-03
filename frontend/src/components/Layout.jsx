import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Logo, IconButton, Avatar, cx } from './ui.jsx';
import { useAuth, useSite, useTheme } from '../context/AppContext.jsx';

export function ThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();
  const order = ['light', 'dark', 'system'];
  const next = order[(order.indexOf(theme) + 1) % 3];
  return <IconButton className={className} icon={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor'} label={`Theme: ${theme}. Switch to ${next}`} onClick={() => setTheme(next)} />;
}

const NAV = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/profiles', label: 'Profiles', icon: 'users' },
  { to: '/shekor', label: 'Shekor', icon: 'tree' },
  { to: '/caller-id', label: 'Caller ID', icon: 'phone' },
  { to: '/search', label: 'Search', icon: 'search' },
];

function SideLink({ item }) {
  return (
    <NavLink to={item.to} end={item.end}
      className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
      <Icon name={item.icon} className="h-[18px] w-[18px]" />{item.label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { siteName } = useSite();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const bottom = [...NAV.slice(0, 4), { to: '/settings', label: 'Account', icon: 'user' }];

  return (
    <div className="min-h-dvh md:pl-64">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface md:flex">
        <Link to="/" className="flex items-center gap-3 px-5 py-5"><Logo /><span className="font-display text-lg font-bold">{siteName}</span></Link>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {NAV.map((n) => <SideLink key={n.to} item={n} />)}
          <div className="my-3 border-t border-line" />
          <SideLink item={{ to: '/settings', label: 'Settings', icon: 'settings' }} />
          {isAdmin && <SideLink item={{ to: '/admin', label: 'Admin', icon: 'shield' }} />}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={user.displayName} size="sm" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user.displayName}</p><p className="truncate text-xs text-muted">{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</p></div>
            <ThemeToggle />
            <IconButton icon="logout" label="Sign out" onClick={async () => { await logout(); navigate('/login'); }} />
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Link to="/" className="flex items-center gap-2"><Logo className="h-7 w-7" /><span className="font-display font-bold">{siteName}</span></Link>
        <div className="flex items-center">
          {isAdmin && <IconButton icon="shield" label="Admin panel" onClick={() => navigate('/admin')} />}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8" key={pathname.split('/')[1]}>
        <Outlet />
      </main>

      {/* mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
        {bottom.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')}>
            <Icon name={n.icon} className="h-5 w-5" />{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
