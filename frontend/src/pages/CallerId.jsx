import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ContactForm from '../components/ContactForm.jsx';
import ProfilePicker from '../components/ProfilePicker.jsx';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, InfiniteFooter, LoadingBlock, Modal, PageHeader, SearchInput, SelectField } from '../components/ui.jsx';
import { useAuth, useSite, useToast } from '../context/AppContext.jsx';
import { useDebounce, useFetch, useInfiniteList, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

export function ContactRow({ c, onEdit, onDelete }) {
  const toast = useToast();
  const copy = async () => { try { await navigator.clipboard.writeText(c.number); toast.success('Number copied'); } catch { toast.error('Could not copy'); } };
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="phone" className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{c.name}</p>
        <a href={`tel:${c.number.replace(/[^\d+*#]/g, '')}`} className="text-sm text-accent hover:underline">{c.number}</a>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {c.relativeName && <span>Saved by <Link to={`/profiles/${c.connectionId}`} className="text-ink hover:text-accent">{c.relativeName}</Link></span>}
          {c.profileId && <Link to={`/profiles/${c.profileId}`}><Badge tone="accent">Profile: {c.profileName}</Badge></Link>}
        </div>
      </div>
      <div className="flex shrink-0">
        <IconButton icon="copy" label="Copy number" onClick={copy} />
        {c.canEdit && onEdit && <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => onEdit(c)} />}
        {c.canEdit && onDelete && <IconButton icon="trash" label={`Delete ${c.name}`} onClick={() => onDelete(c)} />}
      </div>
    </li>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [conn, setConn] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { if (open) { setConn(null); setFile(null); setResult(null); } }, [open]);
  async function run() {
    setBusy(true);
    try { setResult(await api.post('/contacts/import-vcf', { connectionId: conn, vcf: await file.text() })); onDone(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Import a vCard (.vcf) file"
      footer={result ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!file} loading={busy} onClick={run}>Import</Button></>}>
      {result ? (
        <div className="space-y-1 text-sm"><p><b>{result.inserted}</b> contacts added.</p><p className="text-muted">{result.duplicatesSkipped} duplicates skipped · {result.linked} linked to profiles by phone number.</p></div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Export your phone's contacts as a .vcf file and choose it here. Duplicates (same name and number in the same phonebook) are skipped.</p>
          <ProfilePicker label="Whose phonebook is this?" value={conn} onChange={setConn} />
          <input type="file" accept=".vcf,text/vcard,text/x-vcard" aria-label="vCard file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm" />
        </div>
      )}
    </Modal>
  );
}

export default function CallerId() {
  const { user } = useAuth();
  useTitle('Caller ID', useSite().siteName);
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') || '');
  const dq = useDebounce(text, 300);
  const relative = sp.get('relative') || 'all';
  const sort = sp.get('sort') || 'name';
  const limit = Math.max(30, user.preferences?.pageSize || 30);
  const [editing, setEditing] = useState(undefined); // undefined closed | null new | contact
  const [importing, setImporting] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (patch) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setSp(n, { replace: true }); };
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } update({ q: dq }); /* eslint-disable-next-line */ }, [dq]);

  const relatives = useFetch(() => api.get('/contacts/relatives'), []);
  const list = useInfiniteList((page) => api.get('/contacts', { q: sp.get('q') || '', relative, sort, page, limit }), [sp.toString(), limit]);

  async function remove() {
    setBusy(true);
    try { await api.del(`/contacts/${del.id}`); toast.success('Contact deleted'); setDel(null); list.reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  const refresh = () => { list.reload(); relatives.reload(); };

  return (
    <div>
      <PageHeader title="Caller ID" subtitle="Search any name or number across every saved phonebook."
        actions={<><Button icon="upload" onClick={() => setImporting(true)}>Import .vcf</Button><Button variant="primary" icon="plus" onClick={() => setEditing(null)}>Add contact</Button></>} />
      <SearchInput value={text} onChange={setText} placeholder="Type a name or part of a number, e.g. 01712 or Rahim" autoFocus />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
        <SelectField aria-label="Saved by" value={relative} onChange={(e) => update({ relative: e.target.value === 'all' ? '' : e.target.value })}>
          <option value="all">Everyone's phonebook</option>
          {relatives.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.contacts})</option>)}
          <option value="none">Not assigned</option>
        </SelectField>
        <SelectField aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'name' ? '' : e.target.value })}><option value="name">Name A–Z</option><option value="number">By number</option><option value="newest">Newest first</option></SelectField>
      </div>

      <div className="mt-5">
        {list.error && list.items.length === 0 ? <ErrorState error={list.error} onRetry={list.reload} /> : list.initialLoading ? <LoadingBlock rows={6} /> : list.items.length === 0 ? (
          <EmptyState title="No contacts found" icon="phone" action={<Button variant="primary" icon="plus" onClick={() => setEditing(null)}>Add contact</Button>}>{sp.get('q') ? 'Nothing matches that search. Try fewer digits or a shorter name.' : 'Add a contact or import a vCard file to get started.'}</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">{list.total.toLocaleString()} {list.total === 1 ? 'contact' : 'contacts'}</p>
            <Card><ul className="divide-y divide-line">{list.items.map((c) => <ContactRow key={c.id} c={c} onEdit={setEditing} onDelete={setDel} />)}</ul></Card>
            <InfiniteFooter list={list} label="contacts" />
          </>
        )}
      </div>

      <ContactForm open={editing !== undefined} contact={editing || undefined} onClose={() => setEditing(undefined)} onSaved={refresh} />
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={refresh} />
      <ConfirmDialog open={!!del} danger title="Delete this contact?" message={del ? `${del.name} (${del.number}) will be removed from the directory.` : ''} confirmLabel="Delete contact" loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}
