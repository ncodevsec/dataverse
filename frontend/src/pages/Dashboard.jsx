import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Avatar, Card, ErrorState, SearchInput, Skeleton } from '../components/ui.jsx';
import { useAuth, useSite } from '../context/AppContext.jsx';
import { useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { siteName, siteDescription } = useSite();
  useTitle('Home', siteName);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useFetch(() => api.get('/dashboard'), []);

  const tiles = [
    { to: '/shekor', icon: 'tree', title: 'Shekor', text: 'Explore generations, parents, spouses and children as a family tree.', stat: data && `${data.totals.connected} linked to parents` },
    { to: '/caller-id', icon: 'phone', title: 'Caller ID', text: 'Find out who a number belongs to, or search contacts by name.', stat: data && `${data.totals.contacts.toLocaleString()} contacts` },
    { to: '/profiles', icon: 'users', title: 'Profiles', text: 'Browse and manage detailed personal profiles.', stat: data && `${data.totals.profiles.toLocaleString()} people` },
    { to: '/organizations', icon: 'building', title: 'Organizations', text: 'Companies, political parties, groups and their members.', stat: data && `${data.totals.organizations.toLocaleString()} organizations` },
    { to: '/search', icon: 'search', title: 'Search', text: 'One search box across people and contacts.' },
    { to: '/settings', icon: 'settings', title: 'Settings', text: 'Theme, account details and password.' },
    ...(isAdmin ? [{ to: '/admin', icon: 'shield', title: 'Admin', text: 'Users, data, audit log and site settings.' }] : []),
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-muted">Welcome back, {user.displayName.split(' ')[0]}</p>
        <h1 className="mt-1 max-w-2xl text-3xl font-bold sm:text-4xl">{siteName}</h1>
        {siteDescription && <p className="mt-2 max-w-xl text-muted">{siteDescription}</p>}
        <form className="mt-5 max-w-xl" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search a name, nickname, ID or phone number" />
        </form>
      </section>

      <section aria-label="Services" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/60">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name={t.icon} /></span>
              {t.stat ? <span className="text-xs text-muted">{t.stat}</span> : loading && t.stat === undefined && ['/shekor', '/caller-id', '/profiles', '/organizations'].includes(t.to) ? <Skeleton className="h-4 w-20" /> : null}
            </div>
            <h2 className="mt-4 text-lg font-semibold group-hover:text-accent">{t.title}</h2>
            <p className="mt-1 text-sm text-muted">{t.text}</p>
          </Link>
        ))}
      </section>

      <section aria-label="Recently added">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Recently added</h2><Link to="/profiles?sort=newest" className="text-sm text-accent hover:underline">See all</Link></div>
        {error ? <ErrorState error={error} onRetry={reload} /> : (
          <Card className="divide-y divide-line">
            {loading && !data ? Array.from({ length: 4 }, (_, i) => <div key={i} className="p-3"><Skeleton className="h-10" /></div>) :
              data.recent.map((p) => (
                <Link key={p.id} to={`/profiles/${p.id}`} className="flex items-center gap-3 p-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2">
                  <Avatar src={p.photoUrl} name={p.name} size="sm" gender={p.gender} />
                  <div className="min-w-0"><p className="truncate font-medium">{p.name}</p><p className="truncate text-xs text-muted">{[p.occupation, p.district].filter(Boolean).join(' · ') || `#${p.id}`}</p></div>
                </Link>
              ))}
          </Card>
        )}
      </section>
    </div>
  );
}
