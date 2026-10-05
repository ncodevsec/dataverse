import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import ProfilePicker from './ProfilePicker.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, ErrorState, IconButton, LinkButton, LoadingBlock, Modal, SelectField, TextArea, TextField, apiErrors } from './ui.jsx';
import { useToast } from '../context/AppContext.jsx';
import { useFetch } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { LINK_KINDS, entityLabel, linkGroup } from '../lib/options.js';

export function RelativeLink({ p, role, children }) {
  if (!p) return null;
  return (
    <Link to={`/profiles/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line p-2.5 transition-colors hover:border-accent/60">
      <Avatar src={p.photoUrl} name={p.name} size="sm" />
      <div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p>{(role || children) && <p className="text-xs text-muted">{role}{children}</p>}</div>
    </Link>
  );
}

const END_TEXT = { DIVORCED: 'Divorced', WIDOWED: 'Widowed', SEPARATED: 'Separated', OTHER: 'Ended' };
const year = (d) => (d ? String(d).slice(0, 4) : null);
const union = (s) => [s.marriedOn ? `Married ${year(s.marriedOn)}` : null, s.endReason || s.endedOn ? `${END_TEXT[s.endReason] || 'Ended'}${s.endedOn ? ` ${year(s.endedOn)}` : ''}` : s.person.dateOfDeath ? null : 'Current'].filter(Boolean).join(' · ');

/** Parents, then every marriage as its own block with the children of that union, then other children and siblings. */
export function FamilyCard({ p, f }) {
  const spouses = f.spouses || [];
  const otherParent = (c) => (c.fatherId === p.id ? c.motherId : c.fatherId);
  const spouseIds = new Set(spouses.map((s) => s.person.id));
  const strays = f.children.filter((c) => !spouseIds.has(otherParent(c)));
  const hasFamily = f.father || f.mother || spouses.length || f.children.length || f.siblings.length;
  const spouseRole = p.gender === 'FEMALE' ? 'Husband' : p.gender === 'MALE' ? 'Wife' : 'Spouse';
  const addChild = (spouse) => `/profiles/new?${new URLSearchParams({ ...(p.gender === 'FEMALE' ? { motherId: p.id, ...(spouse ? { fatherId: spouse.id } : {}) } : { fatherId: p.id, ...(spouse ? { motherId: spouse.id } : {}) }), copyFrom: p.id })}`;
  const kids = (list) => <div className="grid gap-2 sm:grid-cols-3">{list.map((c) => <RelativeLink key={c.id} p={c} />)}</div>;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Family</h2>{hasFamily && <Link to={`/shekor/${p.id}`} className="text-sm text-accent hover:underline">Open in Shekor</Link>}</div>
      {!hasFamily ? <p className="text-sm text-muted">No relatives are linked yet.{p.permissions.canEdit && <> <Link className="text-accent hover:underline" to={`/profiles/${p.id}/edit`}>Link a parent or spouse</Link>.</>}</p> : (
        <div className="space-y-5">
          {(f.father || f.mother) && <div><h3 className="mb-2 text-sm font-medium text-muted">Parents</h3><div className="grid gap-2 sm:grid-cols-3"><RelativeLink p={f.father} role="Father" /><RelativeLink p={f.mother} role="Mother" /></div></div>}
          {spouses.map((s, i) => {
            const mine = f.children.filter((c) => otherParent(c) === s.person.id);
            return (
              <section key={s.marriageId} className="rounded-xl border border-line p-3" aria-label={`Marriage ${i + 1}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-muted">{spouses.length > 1 ? `${ordinal(i + 1)} marriage` : 'Marriage'}</h3>
                  {s.current && <Badge tone="accent">Current</Badge>}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3"><RelativeLink p={s.person} role={`${spouseRole} · `}>{union(s)}</RelativeLink></div>
                {mine.length > 0 && <div className="mt-3"><h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Children with {s.person.name} ({mine.length})</h4>{kids(mine)}</div>}
                {p.permissions.canEdit && <LinkButton size="sm" variant="ghost" icon="plus" className="mt-2 -ml-2" to={addChild(s.person)}>Add a child with {s.person.name.split(' ')[0]}</LinkButton>}
              </section>
            );
          })}
          {strays.length > 0 && <div><h3 className="mb-2 text-sm font-medium text-muted">{spouses.length ? 'Other children' : 'Children'} ({strays.length})</h3>{kids(strays)}</div>}
          {f.siblings.length > 0 && <div><h3 className="mb-2 text-sm font-medium text-muted">Siblings ({f.siblings.length})</h3>{kids(f.siblings)}</div>}
        </div>
      )}
      {p.permissions.canEdit && <div className="mt-4 border-t border-line pt-4"><LinkButton size="sm" icon="plus" to={addChild(null)}>Add a child</LinkButton></div>}
    </Card>
  );
}
const ordinal = (n) => { const t = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (t[(v - 20) % 10] || t[v] || t[0]); };

// ------------------------------------------------------------------ connections (non-family links)
const ORDER = ['Memberships', 'Part of', 'Affiliations', 'Connections', 'Members', 'Sub-units'];

function LinkModal({ open, profile, link, onClose, onSaved }) {
  const toast = useToast();
  const human = profile.entityType === 'HUMAN';
  const kinds = LINK_KINDS.filter((k) => (human ? k.dir === 'out' && k.type !== 'SUB_UNIT_OF' : !(k.dir === 'in' && (k.type === 'AFFILIATED_WITH' || k.type === 'CONNECTED_TO'))));
  const [kind, setKind] = useState(link ? `${link.linkType}:${link.direction}` : kinds[0].id);
  const [target, setTarget] = useState(link ? link.other : null);
  const [form, setForm] = useState({ role: link?.role || '', startedOn: link?.startedOn || '', endedOn: link?.endedOn || '', note: link?.note || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const k = LINK_KINDS.find((x) => x.id === kind);

  async function save(e) {
    e?.preventDefault();
    if (!link && !target) { setErrors({ toId: 'Choose who or what to connect to' }); return; }
    setBusy(true); setErrors({});
    const extra = { role: form.role || null, startedOn: form.startedOn || null, endedOn: form.endedOn || null, note: form.note || null };
    try {
      if (link) await api.patch(`/links/${link.id}`, extra);
      else await api.post('/links', { fromId: k.dir === 'out' ? profile.id : target.id, toId: k.dir === 'out' ? target.id : profile.id, linkType: k.type, ...extra });
      toast.success(link ? 'Connection updated' : 'Connection added'); onSaved(); onClose();
    } catch (err) { setErrors(apiErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={link ? 'Edit connection' : 'Add a connection'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{link ? 'Save' : 'Add connection'}</Button></>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        {!link && <SelectField label="Relationship" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((x) => <option key={x.id} value={x.id}>{profile.name} {x.label} …</option>)}</SelectField>}
        {link ? <p className="text-sm"><b>{profile.name}</b> {LINK_KINDS.find((x) => x.id === kind)?.label} <b>{link.other.name}</b></p>
          : <ProfilePicker label="With" value={target?.id ?? null} initialLabel={target?.name} onChange={() => {}} onSelect={setTarget} error={errors.toId}
              hint="Groups, organizations, parties, families, other entities or people — search by name or ID." />}
        <TextField label="Role / title (optional)" value={form.role} maxLength={120} placeholder="e.g. President, Founder, Member" error={errors.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Since" type="date" value={form.startedOn} error={errors.startedOn} onChange={(e) => setForm({ ...form, startedOn: e.target.value })} />
          <TextField label="Until" type="date" value={form.endedOn} min={form.startedOn || undefined} error={errors.endedOn} onChange={(e) => setForm({ ...form, endedOn: e.target.value })} hint="Leave empty if ongoing" />
        </div>
        <TextArea label="Note (optional)" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit" className="sr-only">Save</button>
      </form>
    </Modal>
  );
}

function StructureNode({ n, depth = 0 }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <li className={depth ? 'tree-item' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        {n.children.length > 0 ? (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${n.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-muted hover:text-ink"><Icon name={open ? 'down' : 'right'} className="h-4 w-4" /></button>
        ) : <span className="h-7 w-7 shrink-0" aria-hidden />}
        <Link to={`/profiles/${n.id}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent/60"><span className="truncate font-medium">{n.name}</span><Badge>{entityLabel(n.entityType)}</Badge></Link>
        <span className="text-xs text-muted">{n.memberCount} {n.memberCount === 1 ? 'member' : 'members'}</span>
        {n.subUnitCount > n.children.length && <Link to={`/profiles/${n.id}`} className="text-xs text-accent hover:underline">+{n.subUnitCount - n.children.length} more sub-units</Link>}
      </div>
      {open && n.children.length > 0 && <ul className="tree-list">{n.children.map((c) => <StructureNode key={c.id} n={c} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export function ConnectionsCard({ profile }) {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(() => api.get(`/profiles/${profile.id}/links`), [profile.id]);
  const human = profile.entityType === 'HUMAN';
  const structure = useFetch(() => (human ? Promise.resolve(null) : api.get(`/entities/${profile.id}/structure`, { depth: 4 })), [profile.id]);
  const [modal, setModal] = useState(undefined); // undefined closed | null new | link
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];
  const groups = ORDER.map((g) => [g, items.filter((l) => linkGroup(l) === g)]).filter(([, l]) => l.length);
  async function remove() {
    setBusy(true);
    try { await api.del(`/links/${del.id}`); toast.success('Connection removed'); setDel(null); reload(); structure.reload(); } catch (e) { toast.error(e.message); setDel(null); } finally { setBusy(false); }
  }
  const refresh = () => { reload(); structure.reload(); };
  const tree = structure.data?.root;
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{human ? 'Memberships & connections' : 'Members & connections'}</h2>
          {!human && data && <p className="text-xs text-muted">{data.memberCount.toLocaleString()} {data.memberCount === 1 ? 'member' : 'members'} · {data.subUnitCount.toLocaleString()} {data.subUnitCount === 1 ? 'sub-unit' : 'sub-units'}</p>}
        </div>
        <Button size="sm" icon="plus" onClick={() => setModal(null)}>Add connection</Button>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock rows={1} /> : groups.length === 0 ? (
        <p className="text-sm text-muted">{human ? 'Not connected to any group, organization or party yet. These links are separate from family relationships.' : 'No members or connections yet.'}</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([g, list]) => (
            <div key={g}>
              <h3 className="mb-2 text-sm font-medium text-muted">{g} ({list.length})</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
                    <Link to={`/profiles/${l.other.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar src={l.other.photoUrl} name={l.other.name} size="sm" />
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{l.other.name}</span>
                        <span className="block truncate text-xs text-muted">{[l.other.entityType !== 'HUMAN' && entityLabel(l.other.entityType), l.role, l.startedOn && `${year(l.startedOn)}${l.endedOn ? `–${year(l.endedOn)}` : '–'}`].filter(Boolean).join(' · ') || `#${l.other.id}`}</span></span>
                    </Link>
                    {l.canManage && <div className="flex shrink-0"><IconButton icon="edit" label={`Edit connection with ${l.other.name}`} onClick={() => setModal(l)} /><IconButton icon="trash" label={`Remove connection with ${l.other.name}`} onClick={() => setDel(l)} /></div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {data?.truncated && <p className="text-xs text-muted">Only the first {items.length} connections are shown.</p>}
        </div>
      )}
      {tree && tree.children.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-medium text-muted">Structure below {tree.name}</h3>
          <ul className="overflow-x-auto pb-2"><StructureNode n={tree} /></ul>
          {structure.data.truncated && <p className="mt-2 text-xs text-muted">Very large structure: only part is shown. Open a sub-unit to continue.</p>}
        </div>
      )}
      {modal !== undefined && <LinkModal key={modal?.id ?? 'new'} open profile={profile} link={modal || undefined} onClose={() => setModal(undefined)} onSaved={refresh} />}
      <ConfirmDialog open={!!del} danger title="Remove this connection?" message={del ? `${profile.name} and ${del.other.name} will no longer be connected this way. Neither profile is deleted.` : ''} confirmLabel="Remove" loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </Card>
  );
}
