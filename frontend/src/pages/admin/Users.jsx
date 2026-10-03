import { useEffect, useState } from 'react';
import ProfilePicker from '../../components/ProfilePicker.jsx';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingBlock, Modal, Pagination, SearchInput, SelectField, TextField, apiErrors } from '../../components/ui.jsx';
import { useAuth, useToast } from '../../context/AppContext.jsx';
import { useDebounce, useFetch } from '../../hooks/hooks.js';
import { api } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';

function SecretModal({ secret, onClose }) {
  const toast = useToast();
  return (
    <Modal open={!!secret} onClose={onClose} title={secret?.title || ''} size="sm" footer={<Button variant="primary" onClick={onClose}>I've copied it</Button>}>
      <p className="text-sm text-muted">{secret?.text}</p>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3">
        <code className="flex-1 break-all text-base font-semibold tracking-wide">{secret?.password}</code>
        <Button size="sm" icon="copy" onClick={async () => { await navigator.clipboard.writeText(secret.password); toast.success('Copied'); }}>Copy</Button>
      </div>
      <p className="mt-3 text-xs text-muted">This is shown only once and is not stored. The user will be asked to change it after signing in.</p>
    </Modal>
  );
}

function UserForm({ open, user, onClose, onSaved, onSecret }) {
  const toast = useToast();
  const blank = { displayName: '', username: '', email: '', password: '', role: 'USER', profileId: null, isActive: true };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm(user ? { displayName: user.displayName, username: user.username, email: user.email, password: '', role: user.role, profileId: user.profileId, isActive: user.isActive } : blank); setErrors({}); } /* eslint-disable-next-line */ }, [open, user]);
  async function save(e) {
    e?.preventDefault(); setBusy(true); setErrors({});
    try {
      if (user) { const { password, ...rest } = form; await api.patch(`/admin/users/${user.id}`, rest); toast.success('User updated'); }
      else {
        const body = { ...form }; if (!body.password) delete body.password; delete body.isActive;
        const d = await api.post('/admin/users', body); toast.success('User created');
        if (d.temporaryPassword) onSecret({ title: 'Temporary password', text: `Share this with ${d.user.displayName}:`, password: d.temporaryPassword });
      }
      onSaved(); onClose();
    } catch (err) { setErrors(apiErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={user ? `Edit ${user.displayName}` : 'Create user'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{user ? 'Save changes' : 'Create user'}</Button></>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <TextField label="Display name" required value={form.displayName} error={errors.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Username" required value={form.username} error={errors.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <TextField label="Email" type="email" required value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        {!user && <TextField label="Password" type="password" autoComplete="new-password" value={form.password} error={errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="Leave empty to generate a temporary password" />}
        <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} hint={form.role === 'ADMIN' ? 'Administrators can manage all data, users and settings.' : undefined}><option value="USER">User</option><option value="ADMIN">Administrator</option></SelectField>
        <ProfilePicker label="Linked profile (optional)" value={form.profileId} onChange={(v) => setForm({ ...form, profileId: v })} initialLabel={user?.profileName} error={errors.profileId} hint="Lets this person edit their own profile and see their NID." />
        {user && <Checkbox label="Account is active" hint="Inactive users cannot sign in." checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
        <button type="submit" className="sr-only">Save</button>
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const dq = useDebounce(text, 300);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(undefined);
  const [del, setDel] = useState(null);
  const [reset, setReset] = useState(null);
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPage(1), [dq, role, status]);
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/users', { q: dq, role, status, page, limit: 20 }), [dq, role, status, page]);

  async function doDelete() {
    setBusy(true);
    try { await api.del(`/admin/users/${del.id}`); toast.success('User deleted'); setDel(null); reload(); } catch (e) { toast.error(e.message); setDel(null); } finally { setBusy(false); }
  }
  async function doReset() {
    setBusy(true);
    try { const d = await api.post(`/admin/users/${reset.id}/reset-password`, {}); setSecret({ title: 'Password reset', text: `New temporary password for ${reset.displayName}:`, password: d.temporaryPassword }); setReset(null); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function toggleActive(u) {
    try { await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }); toast.success(u.isActive ? 'User deactivated' : 'User activated'); reload(); } catch (e) { toast.error(e.message); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="min-w-[14rem] flex-1" value={text} onChange={setText} placeholder="Search name, username or email" />
        <SelectField aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="ADMIN">Administrators</option><option value="USER">Users</option></SelectField>
        <SelectField aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></SelectField>
        <Button variant="primary" icon="plus" onClick={() => setEdit(null)}>Create user</Button>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : data.items.length === 0 ? <EmptyState title="No users match" icon="users" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Last sign-in</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3"><p className="font-medium">{u.displayName}{u.id === me.id && <span className="ml-2 text-xs text-muted">(you)</span>}</p><p className="text-xs text-muted">@{u.username} · {u.email}</p></td>
                    <td className="px-4 py-3">{u.role === 'ADMIN' ? <Badge tone="accent">Admin</Badge> : <Badge>User</Badge>}</td>
                    <td className="px-4 py-3">{u.isActive ? <Badge>Active</Badge> : <Badge tone="danger">Inactive</Badge>}{u.mustChangePassword && <Badge tone="warn" className="ml-1">Must change password</Badge>}</td>
                    <td className="px-4 py-3 text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
                    <td className="px-4 py-3"><div className="flex justify-end">
                      <IconButton icon="edit" label={`Edit ${u.displayName}`} onClick={() => setEdit(u)} />
                      <IconButton icon="key" label={`Reset password for ${u.displayName}`} onClick={() => setReset(u)} />
                      {u.id !== me.id && <><IconButton icon={u.isActive ? 'x' : 'check'} label={u.isActive ? `Deactivate ${u.displayName}` : `Activate ${u.displayName}`} onClick={() => toggleActive(u)} /><IconButton icon="trash" label={`Delete ${u.displayName}`} onClick={() => setDel(u)} /></>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.page} pages={data.pages} total={data.total} label="users" onPage={setPage} />
        </>
      )}
      <UserForm open={edit !== undefined} user={edit || undefined} onClose={() => setEdit(undefined)} onSaved={reload} onSecret={setSecret} />
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog open={!!reset} title="Reset password?" confirmLabel="Reset password" loading={busy} onConfirm={doReset} onClose={() => setReset(null)}
        message={reset ? `${reset.displayName} will be signed out everywhere and given a new temporary password that you can share with them.` : ''} />
      <ConfirmDialog open={!!del} danger title={`Delete ${del?.displayName}?`} confirmLabel="Delete user" loading={busy} onConfirm={doDelete} onClose={() => setDel(null)}
        message="This permanently deletes the account. Profiles and contacts they created are kept. Consider deactivating instead if you may need the account again." />
    </div>
  );
}
