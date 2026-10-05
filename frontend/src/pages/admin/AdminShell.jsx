import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Badge, Card, ErrorState, LoadingBlock, PageHeader, Stat, cx } from '../../components/ui.jsx';
import { useSite } from '../../context/AppContext.jsx';
import { useFetch, useTitle } from '../../hooks/hooks.js';
import { api } from '../../lib/api.js';
import { bytes, fmtDateTime, timeAgo } from '../../lib/format.js';
import Users from './Users.jsx';
import { AdminProfiles, AdminContacts } from './AdminData.jsx';
import Audit from './Audit.jsx';
import SiteSettings from './SiteSettings.jsx';
import Backup from './Backup.jsx';

const LINKS = [['/admin', 'Overview', true], ['/admin/users', 'Users'], ['/admin/profiles', 'Profiles'], ['/admin/contacts', 'Caller ID'], ['/admin/audit', 'Audit log'], ['/admin/settings', 'Site settings'], ['/admin/backup', 'Backup']];

function Overview() {
  const stats = useFetch(() => api.get('/admin/stats'), []);
  const system = useFetch(() => api.get('/admin/system'), []);
  if (stats.error) return <ErrorState error={stats.error} onRetry={stats.reload} />;
  if (!stats.data) return <LoadingBlock rows={4} />;
  const { totals: t, daily, recentUsers, recentActivity } = stats.data;
  const max = Math.max(1, ...daily.map((d) => d.users + d.profiles + d.contacts));
  return (
    <div className="space-y-6">
      {t.pendingUsers > 0 && (
        <Link to="/admin/users?approval=pending" className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm">
          <span><b>{t.pendingUsers}</b> new {t.pendingUsers === 1 ? 'account is' : 'accounts are'} waiting for your approval.</span>
          <span className="font-medium text-accent">Review requests →</span>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={t.users} hint={`${t.admins} admin${t.admins === 1 ? '' : 's'} · ${t.pendingUsers} pending · ${t.inactiveUsers} inactive`} to="/admin/users" />
        <Stat label="Profiles" value={t.profiles.toLocaleString()} hint={`${t.profilesWithPhoto} with photo · ${t.married} married`} to="/admin/profiles" />
        <Stat label="Contacts" value={t.contacts.toLocaleString()} hint={`${t.uniqueNumbers.toLocaleString()} unique numbers`} to="/admin/contacts" />
        <Stat label="Audit events" value={t.auditEvents.toLocaleString()} hint={`${t.posts} notes`} to="/admin/audit" />
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold">New records, last 14 days</h2>
        <div className="mt-4 flex h-32 items-end gap-1.5" role="img" aria-label="Bar chart of new users, profiles and contacts per day">
          {daily.map((d) => {
            const total = d.users + d.profiles + d.contacts;
            return (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.users} users, ${d.profiles} profiles, ${d.contacts} contacts`}>
                <div className="flex w-full flex-1 items-end"><div className="w-full rounded-t bg-accent/80" style={{ height: `${Math.max(total ? 6 : 2, (total / max) * 100)}%`, opacity: total ? 1 : 0.25 }} /></div>
                <span className="text-[10px] text-muted">{d.day.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold">Newest accounts</h2>
          <ul className="divide-y divide-line">{recentUsers.map((u) => <li key={u.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{u.displayName}</span><span className="block truncate text-xs text-muted">{u.email}</span></span><span className="flex shrink-0 items-center gap-2">{u.role === 'ADMIN' && <Badge tone="accent">Admin</Badge>}<span className="text-xs text-muted">{timeAgo(u.createdAt)}</span></span></li>)}</ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
          {recentActivity.length === 0 ? <p className="text-sm text-muted">Nothing recorded yet.</p> : <ul className="divide-y divide-line">{recentActivity.map((a) => <li key={a.id} className="py-2 text-sm"><p>{a.summary || a.action}</p><p className="text-xs text-muted">{a.actor} · {timeAgo(a.createdAt)}</p></li>)}</ul>}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">System</h2>
        {system.error ? <p className="text-sm text-muted">System details are unavailable right now.</p> : !system.data ? <LoadingBlock rows={1} /> : (
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Database</dt><dd>{system.data.database.version}</dd></div>
            <div><dt className="text-muted">Database size</dt><dd>{bytes(system.data.database.sizeBytes)}</dd></div>
            <div><dt className="text-muted">Runtime</dt><dd>Node {system.data.runtime.node} · {system.data.runtime.serverless ? 'serverless' : 'server'} · {system.data.runtime.environment}</dd></div>
            <div><dt className="text-muted">Password-reset email</dt><dd>{system.data.config.mailConfigured ? 'Configured' : 'Not configured (admins can reset passwords manually)'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted">Migrations applied</dt><dd>{system.data.database.migrations.map((m) => `${m.name} (${fmtDateTime(m.applied_at)})`).join(', ') || '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="mb-1 text-muted">Largest tables</dt><dd className="flex flex-wrap gap-2">{system.data.database.tables.slice(0, 6).map((tb) => <Badge key={tb.name}>{tb.name}: {Number(tb.rows).toLocaleString()} rows · {bytes(tb.bytes)}</Badge>)}</dd></div>
          </dl>
        )}
      </Card>
    </div>
  );
}

export default function AdminShell() {
  useTitle('Admin', useSite().siteName);
  return (
    <div>
      <PageHeader title="Admin panel" subtitle="Manage people, data and site configuration. Every action here is checked again on the server." />
      <nav aria-label="Admin sections" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {LINKS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium', isActive ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>{label}</NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="users" element={<Users />} />
        <Route path="profiles" element={<AdminProfiles />} />
        <Route path="contacts" element={<AdminContacts />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<SiteSettings />} />
        <Route path="backup" element={<Backup />} />
      </Routes>
    </div>
  );
}
