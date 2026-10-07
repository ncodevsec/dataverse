import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ContactForm from '../../components/ContactForm.jsx';
import Icon from '../../components/Icon.jsx';
import ProfilePicker from '../../components/ProfilePicker.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, InfiniteFooter, LinkButton, LoadingBlock, Modal, Pagination, SearchInput, SelectField } from '../../components/ui.jsx';
import { useToast } from '../../context/AppContext.jsx';
import { useDebounce, useFetch, useInfiniteList } from '../../hooks/hooks.js';
import { orgTypeLabel } from '../../lib/options.js';
import { api } from '../../lib/api.js';

export function AdminProfiles() {
  const toast = useToast();
  const [text, setText] = useState('');
  const dq = useDebounce(text, 300);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPage(1), [dq, sort]);
  const { data, error, loading, reload } = useFetch(() => api.get('/profiles', { q: dq, sort, page, limit: 25 }), [dq, sort, page]);

  async function remove() {
    setBusy(true);
    try { await api.del(`/profiles/${del.id}`); toast.success(`Deleted ${del.name}`); setDel(null); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="min-w-[14rem] flex-1" value={text} onChange={setText} placeholder="Search profiles by name, ID, phone…" />
        <SelectField aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Name A–Z</option><option value="newest">Newest first</option><option value="id">By ID</option></SelectField>
        <LinkButton to="/profiles/new" variant="primary" icon="plus">Add profile</LinkButton>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : data.items.length === 0 ? <EmptyState title="No profiles match" icon="users" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-3 font-medium">Person</th><th className="px-4 py-3 font-medium">ID</th><th className="px-4 py-3 font-medium">Phone</th><th className="px-4 py-3 font-medium">District</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5"><Link to={`/profiles/${p.id}`} className="flex items-center gap-3 hover:text-accent"><Avatar src={p.photoUrl} name={p.name} size="sm" gender={p.gender} /><span className="font-medium">{p.name}</span></Link></td>
                    <td className="px-4 py-2.5 text-muted">#{p.id}</td>
                    <td className="px-4 py-2.5 text-muted">{p.phone || '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{p.district || '—'}</td>
                    <td className="px-4 py-2.5"><div className="flex justify-end">
                      <Link to={`/profiles/${p.id}/edit`} aria-label={`Edit ${p.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" title="Edit"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg></Link>
                      <IconButton icon="trash" label={`Delete ${p.name}`} onClick={() => setDel(p)} />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.page} pages={data.pages} total={data.total} label="profiles" onPage={setPage} />
        </>
      )}
      <ConfirmDialog open={!!del} danger title={`Delete ${del?.name}?`} confirmLabel="Delete profile" loading={busy} onConfirm={remove} onClose={() => setDel(null)}
        message="The profile, its photo and notes are permanently removed, and relatives lose their link to this person. This is recorded in the audit log." />
    </div>
  );
}

export function AdminContacts() {
  const toast = useToast();
  const [text, setText] = useState('');
  const dq = useDebounce(text, 300);
  const [relative, setRelative] = useState('all');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(undefined);
  const [del, setDel] = useState(null);
  const [tools, setTools] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPage(1), [dq, relative]);
  const relatives = useFetch(() => api.get('/contacts/relatives'), []);
  const { data, error, loading, reload } = useFetch(() => api.get('/contacts', { q: dq, relative, page, limit: 25 }), [dq, relative, page]);

  async function remove() {
    setBusy(true);
    try { await api.del(`/contacts/${del.id}`); toast.success('Contact deleted'); setDel(null); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="min-w-[14rem] flex-1" value={text} onChange={setText} placeholder="Search name or number" />
        <SelectField aria-label="Saved by" value={relative} onChange={(e) => setRelative(e.target.value)}><option value="all">All phonebooks</option>{relatives.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.contacts})</option>)}<option value="none">Not assigned</option></SelectField>
        <Button icon="settings" onClick={() => setTools(true)}>Tools</Button>
        <Button variant="primary" icon="plus" onClick={() => setEdit(null)}>Add contact</Button>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : data.items.length === 0 ? <EmptyState title="No contacts match" icon="phone" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Number</th><th className="px-4 py-3 font-medium">Saved by</th><th className="px-4 py-3 font-medium">Profile</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted">{c.number}</td>
                    <td className="px-4 py-2.5 text-muted">{c.relativeName || '—'}</td>
                    <td className="px-4 py-2.5">{c.profileId ? <Link to={`/profiles/${c.profileId}`}><Badge tone="accent">{c.profileName}</Badge></Link> : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-2.5"><div className="flex justify-end"><IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => setEdit(c)} /><IconButton icon="trash" label={`Delete ${c.name}`} onClick={() => setDel(c)} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.page} pages={data.pages} total={data.total} label="contacts" onPage={setPage} />
        </>
      )}
      <ContactForm open={edit !== undefined} contact={edit || undefined} onClose={() => setEdit(undefined)} onSaved={() => { reload(); relatives.reload(); }} />
      <ConfirmDialog open={!!del} danger title="Delete this contact?" message={del ? `${del.name} (${del.number})` : ''} confirmLabel="Delete contact" loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
      <ContactTools open={tools} onClose={() => setTools(false)} relatives={relatives.data?.items || []} onChanged={() => { reload(); relatives.reload(); }} />
    </div>
  );
}

function ContactTools({ open, onClose, relatives, onChanged }) {
  const toast = useToast();
  const dup = useFetch(() => (open ? api.get('/admin/contacts/duplicates') : Promise.resolve(null)), [open]);
  const [book, setBook] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function relink() {
    setBusy(true);
    try { const d = await api.post('/admin/contacts/relink'); toast.success(`${d.linked} contacts linked to profiles`); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function wipe() {
    setBusy(true);
    try { const d = await api.del(`/admin/contacts/phonebook/${book}`); toast.success(`Deleted ${d?.deleted ?? ''} contacts`); setConfirm(false); setBook(null); onChanged(); dup.reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Caller ID tools" size="lg">
      <div className="space-y-6 text-sm">
        <section>
          <h3 className="font-semibold">Link contacts to profiles</h3>
          <p className="mb-2 text-muted">Matches contacts to a profile when the phone number belongs to exactly one profile. Existing links are never changed.</p>
          <Button loading={busy} onClick={relink}>Run matching</Button>
        </section>
        <section>
          <h3 className="font-semibold">Numbers saved more than once</h3>
          <p className="mb-2 text-muted">The same name + number in one phonebook can't be added twice. These numbers appear in several phonebooks or under different names, which is normal for Caller ID.</p>
          {dup.data ? <p><b>{dup.data.sharedNumbers.toLocaleString()}</b> numbers are shared across entries.{dup.data.top.length > 0 && <> Most repeated: {dup.data.top.slice(0, 3).map((d) => `${d.number_digits} (${d.entries}×)`).join(', ')}.</>}</p> : <p className="text-muted">Loading…</p>}
        </section>
        <section>
          <h3 className="font-semibold text-danger">Delete a whole phonebook</h3>
          <p className="mb-2 text-muted">Removes every contact saved by one person. Use this to re-import a corrected file.</p>
          <div className="flex gap-2"><div className="flex-1"><SelectField aria-label="Phonebook" value={book || ''} onChange={(e) => setBook(e.target.value ? Number(e.target.value) : null)}><option value="">Choose a phonebook…</option>{relatives.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.contacts})</option>)}</SelectField></div><Button variant="danger" disabled={!book} onClick={() => setConfirm(true)}>Delete</Button></div>
        </section>
      </div>
      <ConfirmDialog open={confirm} danger title="Delete this phonebook?" message="All contacts saved by this person will be permanently removed. This is recorded in the audit log." confirmLabel="Delete all contacts" loading={busy} onConfirm={wipe} onClose={() => setConfirm(false)} />
    </Modal>
  );
}

export function AdminOrganizations() {
  const toast = useToast();
  const [text, setText] = useState('');
  const dq = useDebounce(text, 300);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = useInfiniteList((page) => api.get('/organizations', { q: dq, sort: 'newest', page, limit: 30 }), [dq]);
  async function remove() {
    setBusy(true);
    try { await api.del(`/organizations/${del.id}`); toast.success(`Deleted ${del.name}`); setDel(null); list.reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="min-w-[14rem] flex-1" value={text} onChange={setText} placeholder="Search organizations by name or ID…" />
        <LinkButton to="/organizations/new" variant="primary" icon="plus">Add organization</LinkButton>
      </div>
      {list.error && list.items.length === 0 ? <ErrorState error={list.error} onRetry={list.reload} /> : list.initialLoading ? <LoadingBlock /> : list.items.length === 0 ? <EmptyState title="No organizations match" icon="building" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-3 font-medium">Organization</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">ID</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">
                {list.items.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5"><Link to={`/organizations/${o.id}`} className="flex items-center gap-3 hover:text-accent"><Avatar src={o.photoUrl} name={o.name} size="sm" /><span className="font-medium">{o.name}</span></Link></td>
                    <td className="px-4 py-2.5 text-muted">{orgTypeLabel(o.orgType)}</td>
                    <td className="px-4 py-2.5 text-muted">#{o.id}</td>
                    <td className="px-4 py-2.5"><div className="flex justify-end"><Link to={`/organizations/${o.id}/edit`} aria-label={`Edit ${o.name}`} title="Edit" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"><Icon name="edit" className="h-[18px] w-[18px]" /></Link><IconButton icon="trash" label={`Delete ${o.name}`} onClick={() => setDel(o)} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <InfiniteFooter list={list} label="organizations" />
        </>
      )}
      <ConfirmDialog open={!!del} danger title={`Delete ${del?.name}?`} confirmLabel="Delete organization" loading={busy} onConfirm={remove} onClose={() => setDel(null)}
        message="The organization, its logo, posts and connections are permanently removed. People are not deleted. This is recorded in the audit log." />
    </div>
  );
}
