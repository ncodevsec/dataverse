import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Badge, Button, Card, PageHeader, SelectField, Tabs, TextField, apiErrors, cx } from '../components/ui.jsx';
import { useAuth, useSite, useTheme, useToast } from '../context/AppContext.jsx';
import { useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

function Account() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ displayName: user.displayName, username: user.username, email: user.email });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault(); setBusy(true); setErrors({});
    try { const d = await api.patch('/me', form); setUser(d.user); toast.success('Account updated'); } catch (err) { setErrors(apiErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <TextField label="Display name" value={form.displayName} error={errors.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      <TextField label="Username" value={form.username} error={errors.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      <TextField label="Email" type="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <div className="rounded-xl border border-line p-3 text-sm">
        <p className="font-medium">Role</p><p className="text-muted">{user.role === 'ADMIN' ? 'Administrator' : 'Member'}. Only an administrator can change this.</p>
        {user.profileId && <p className="mt-2"><Link className="text-accent hover:underline" to={`/profiles/${user.profileId}`}>View my linked profile</Link></p>}
      </div>
      <Button type="submit" variant="primary" loading={busy}>Save changes</Button>
    </form>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const prefs = user.preferences || {};
  const options = [{ id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }, { id: 'system', label: 'System', icon: 'monitor' }];
  async function savePref(patch) {
    try { const d = await api.patch('/me', { preferences: patch }); setUser(d.user); toast.success('Preference saved'); } catch (err) { toast.error(err.message); }
  }
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Theme</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={theme === o.id} onClick={() => setTheme(o.id)}
              className={cx('flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors', theme === o.id ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2')}>
              <Icon name={o.icon} className="h-6 w-6" />{o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">System follows your device setting. Your choice is remembered on this device and saved to your account.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Results per page" value={prefs.pageSize || 24} onChange={(e) => savePref({ pageSize: Number(e.target.value) })}>{[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
        <SelectField label="Date format" value={prefs.dateFormat || 'dmy'} onChange={(e) => savePref({ dateFormat: e.target.value })}><option value="dmy">12 March, 1990</option><option value="mdy">03/12/1990</option><option value="iso">1990-03-12</option></SelectField>
      </div>
    </div>
  );
}

function Security() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault(); setBusy(true); setErrors({});
    try { const d = await api.put('/me/password', form); setUser(d.user); setForm({ currentPassword: '', newPassword: '' }); toast.success('Password changed. Other devices were signed out.'); }
    catch (err) { setErrors(apiErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      {user.mustChangePassword && <div role="alert" className="rounded-xl border border-line bg-warn-soft p-3 text-sm">An administrator set a temporary password for you. Please choose your own now.</div>}
      <TextField label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} error={errors.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
      <TextField label="New password" type="password" autoComplete="new-password" value={form.newPassword} error={errors.newPassword} hint="At least 10 characters" onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
      <Button type="submit" variant="primary" loading={busy}>Change password</Button>
    </form>
  );
}

export default function Settings() {
  const { user, isAdmin, logout } = useAuth();
  useTitle('Settings', useSite().siteName);
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') || (user.mustChangePassword ? 'security' : 'account'));
  useEffect(() => { if (user.mustChangePassword) setTab('security'); }, [user.mustChangePassword]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle={`Signed in as ${user.email}`} actions={isAdmin && <Link to="/admin/settings"><Badge tone="accent">Site settings are in Admin</Badge></Link>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setSp({ tab: t }, { replace: true }); }} tabs={[{ id: 'account', label: 'Account' }, { id: 'appearance', label: 'Appearance' }, { id: 'security', label: 'Password' }]} />
      <Card className="mt-5 p-5">{tab === 'account' ? <Account /> : tab === 'appearance' ? <Appearance /> : <Security />}</Card>
      <div className="mt-6 md:hidden"><Button className="w-full" icon="logout" onClick={logout}>Sign out</Button></div>
    </div>
  );
}
