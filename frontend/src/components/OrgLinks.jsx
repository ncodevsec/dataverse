import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import ProfilePicker from './ProfilePicker.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, ErrorState, IconButton, InfiniteFooter, LoadingBlock, Modal, SelectField, TextArea, TextField, apiErrors } from './ui.jsx';
import { useToast } from '../context/AppContext.jsx';
import { useFetch, useInfiniteList } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { MEMBERSHIP_RELATIONS, ORG_LINK_KINDS, orgLinkGroup, orgTypeLabel } from '../lib/options.js';

const year = (d) => (d ? String(d).slice(0, 4) : null);
const span = (l) => (l.startedOn ? `${year(l.startedOn)}${l.endedOn ? `–${year(l.endedOn)}` : '–'}` : l.endedOn ? `until ${year(l.endedOn)}` : null);

const DetailsFields = ({ form, setForm, errors }) => (
  <>
    <TextField label="Role / title (optional)" value={form.role} maxLength={120} placeholder="e.g. President, Founder, Member" error={errors.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Since" type="date" value={form.startedOn} error={errors.startedOn} onChange={(e) => setForm({ ...form, startedOn: e.target.value })} />
      <TextField label="Until" type="date" value={form.endedOn} min={form.startedOn || undefined} error={errors.endedOn} onChange={(e) => setForm({ ...form, endedOn: e.target.value })} hint="Leave empty if ongoing" />
    </div>
    <TextArea label="Note (optional)" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
  </>
);
const toForm = (l) => ({ role: l?.role || '', startedOn: l?.startedOn || '', endedOn: l?.endedOn || '', note: l?.note || '' });
const extras = (f) => ({ role: f.role || null, startedOn: f.startedOn || null, endedOn: f.endedOn || null, note: f.note || null });

/** Add / edit a person <-> organization connection. `human` or `organization` is the fixed side; the other is picked. */
function MembershipModal({ human, organization, membership, onClose, onSaved }) {
  const toast = useToast();
  const fixedIsHuman = !!human;
  const [relation, setRelation] = useState(membership?.relation || 'MEMBER');
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState(toForm(membership));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const subject = human?.name || organization?.name;
  const rel = MEMBERSHIP_RELATIONS.find((r) => r.id === relation);
  async function save(e) {
    e?.preventDefault();
    if (!membership && !target) { setErrors({ target: fixedIsHuman ? 'Choose an organization' : 'Choose a person' }); return; }
    setBusy(true); setErrors({});
    try {
      if (membership) await api.patch(`/memberships/${membership.id}`, extras(form));
      else await api.post('/memberships', { humanId: human?.id ?? target.id, organizationId: organization?.id ?? target.id, relation, ...extras(form) });
      toast.success(membership ? 'Connection updated' : 'Connection added'); onSaved(); onClose();
    } catch (err) { const d = apiErrors(err); setErrors({ ...d, target: d.target || d.humanId || d.organizationId }); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={membership ? 'Edit connection' : fixedIsHuman ? 'Add an organization' : 'Add a person'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{membership ? 'Save' : 'Add'}</Button></>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        {membership ? <p className="text-sm"><b>{subject}</b> {rel?.[fixedIsHuman ? 'human' : 'org']} <b>{membership.organization?.name || membership.human?.name}</b></p> : (
          <>
            <SelectField label="Relationship" value={relation} onChange={(e) => setRelation(e.target.value)}>
              {MEMBERSHIP_RELATIONS.map((r) => <option key={r.id} value={r.id}>{subject} {r[fixedIsHuman ? 'human' : 'org']} …</option>)}
            </SelectField>
            <ProfilePicker kind={fixedIsHuman ? 'organization' : 'human'} label={fixedIsHuman ? 'Organization' : 'Person'} value={target?.id ?? null} onChange={() => {}} onSelect={setTarget} error={errors.target}
              hint="Search by name or ID. This is separate from family relationships." />
          </>
        )}
        <DetailsFields form={form} setForm={setForm} errors={errors} />
        <button type="submit" className="sr-only">Save</button>
      </form>
    </Modal>
  );
}

/** Person page: organizations the person belongs to, is affiliated with or connected to. */
export function MembershipsCard({ profile }) {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(() => api.get(`/profiles/${profile.id}/memberships`), [profile.id]);
  const [modal, setModal] = useState(undefined); // undefined closed | null new | membership
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];
  const groups = MEMBERSHIP_RELATIONS.map((r) => [r.group, items.filter((m) => m.relation === r.id)]).filter(([, l]) => l.length);
  async function remove() {
    setBusy(true);
    try { await api.del(`/memberships/${del.id}`); toast.success('Connection removed'); setDel(null); reload(); } catch (e) { toast.error(e.message); setDel(null); } finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Organizations</h2>
        <Button size="sm" icon="plus" onClick={() => setModal(null)}>Add organization</Button>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock rows={1} /> : groups.length === 0 ? (
        <p className="text-sm text-muted">Not connected to any company, party, group or other organization yet. These links are separate from family relationships.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([g, list]) => (
            <div key={g}>
              <h3 className="mb-2 text-sm font-medium text-muted">{g} ({list.length})</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
                    <Link to={`/organizations/${m.organization.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar src={m.organization.photoUrl} name={m.organization.name} size="sm" />
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{m.organization.name}</span>
                        <span className="block truncate text-xs text-muted">{[orgTypeLabel(m.organization.orgType), m.role, span(m)].filter(Boolean).join(' · ')}</span></span>
                    </Link>
                    {m.canManage && <div className="flex shrink-0"><IconButton icon="edit" label={`Edit connection with ${m.organization.name}`} onClick={() => setModal(m)} /><IconButton icon="trash" label={`Remove connection with ${m.organization.name}`} onClick={() => setDel(m)} /></div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {modal !== undefined && <MembershipModal key={modal?.id ?? 'new'} human={profile} membership={modal || undefined} onClose={() => setModal(undefined)} onSaved={reload} />}
      <ConfirmDialog open={!!del} danger title="Remove this connection?" message={del ? `${profile.name} and ${del.organization.name} will no longer be connected. Neither is deleted.` : ''} confirmLabel="Remove" loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </Card>
  );
}

// ------------------------------------------------------------------ organization side
function OrgLinkModal({ organization, link, onClose, onSaved }) {
  const toast = useToast();
  const [kind, setKind] = useState(link ? `${link.linkType}:${link.direction}` : ORG_LINK_KINDS[0].id);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState(toForm(link));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const k = ORG_LINK_KINDS.find((x) => x.id === kind) || ORG_LINK_KINDS.find((x) => x.type === link?.linkType);
  async function save(e) {
    e?.preventDefault();
    if (!link && !target) { setErrors({ target: 'Choose an organization' }); return; }
    setBusy(true); setErrors({});
    try {
      if (link) await api.patch(`/org-links/${link.id}`, extras(form));
      else await api.post('/org-links', { fromId: k.dir === 'out' ? organization.id : target.id, toId: k.dir === 'out' ? target.id : organization.id, linkType: k.type, ...extras(form) });
      toast.success(link ? 'Connection updated' : 'Connection added'); onSaved(); onClose();
    } catch (err) { const d = apiErrors(err); setErrors({ ...d, target: d.toId || d.target }); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={link ? 'Edit connection' : 'Connect another organization'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{link ? 'Save' : 'Add'}</Button></>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        {link ? <p className="text-sm"><b>{organization.name}</b> {k?.label} <b>{link.other.name}</b></p> : (
          <>
            <SelectField label="Relationship" value={kind} onChange={(e) => setKind(e.target.value)}>{ORG_LINK_KINDS.map((x) => <option key={x.id} value={x.id}>{organization.name} {x.label} …</option>)}</SelectField>
            <ProfilePicker kind="organization" label="Organization" value={target?.id ?? null} onChange={() => {}} onSelect={setTarget} error={errors.target} exclude={[organization.id]} hint="Sub-units, parent bodies, federations, affiliations…" />
          </>
        )}
        <DetailsFields form={form} setForm={setForm} errors={errors} />
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
        <Link to={`/organizations/${n.id}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-sm hover:border-accent/60"><span className="truncate font-medium">{n.name}</span><Badge>{orgTypeLabel(n.orgType)}</Badge></Link>
        <span className="text-xs text-muted">{n.memberCount} {n.memberCount === 1 ? 'member' : 'members'}</span>
        {n.subUnitCount > n.children.length && <Link to={`/organizations/${n.id}`} className="text-xs text-accent hover:underline">+{n.subUnitCount - n.children.length} more sub-units</Link>}
      </div>
      {open && n.children.length > 0 && <ul className="tree-list">{n.children.map((c) => <StructureNode key={c.id} n={c} depth={depth + 1} />)}</ul>}
    </li>
  );
}

/** Organization page: related organizations, structure below it, and its people (infinite list). */
export function OrgConnectionsCard({ organization }) {
  const toast = useToast();
  const rel = useFetch(() => api.get(`/organizations/${organization.id}/relations`), [organization.id]);
  const structure = useFetch(() => api.get(`/organizations/${organization.id}/structure`, { depth: 4 }), [organization.id]);
  const [q, setQ] = useState('');
  const members = useInfiniteList((page) => api.get(`/organizations/${organization.id}/members`, { page, limit: 30, q }), [organization.id, q]);
  const [linkModal, setLinkModal] = useState(undefined);
  const [memModal, setMemModal] = useState(undefined);
  const [del, setDel] = useState(null); // { kind: 'link' | 'member', item }
  const [busy, setBusy] = useState(false);
  const items = rel.data?.items || [];
  const order = ['Part of', 'Sub-units', 'Member of', 'Member organizations', 'Affiliations', 'Connections'];
  const groups = order.map((g) => [g, items.filter((l) => orgLinkGroup(l) === g)]).filter(([, l]) => l.length);
  const refresh = () => { rel.reload(); structure.reload(); members.reload(); };
  async function remove() {
    setBusy(true);
    try { await api.del(del.kind === 'link' ? `/org-links/${del.item.id}` : `/memberships/${del.item.id}`); toast.success('Connection removed'); setDel(null); refresh(); } catch (e) { toast.error(e.message); setDel(null); } finally { setBusy(false); }
  }
  const tree = structure.data?.root;
  return (
    <>
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold">Related organizations</h2>{rel.data && <p className="text-xs text-muted">{rel.data.subUnitCount.toLocaleString()} {rel.data.subUnitCount === 1 ? 'sub-unit' : 'sub-units'}</p>}</div>
          <Button size="sm" icon="plus" onClick={() => setLinkModal(null)}>Connect organization</Button>
        </div>
        {rel.error ? <ErrorState error={rel.error} onRetry={rel.reload} /> : rel.loading && !rel.data ? <LoadingBlock rows={1} /> : groups.length === 0 ? <p className="text-sm text-muted">No sub-units or related organizations yet.</p> : (
          <div className="space-y-4">
            {groups.map(([g, list]) => (
              <div key={g}>
                <h3 className="mb-2 text-sm font-medium text-muted">{g} ({list.length})</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {list.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
                      <Link to={`/organizations/${l.other.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar src={l.other.photoUrl} name={l.other.name} size="sm" />
                        <span className="min-w-0"><span className="block truncate text-sm font-medium">{l.other.name}</span><span className="block truncate text-xs text-muted">{[orgTypeLabel(l.other.orgType), l.role, span(l)].filter(Boolean).join(' · ')}</span></span>
                      </Link>
                      {l.canManage && <div className="flex shrink-0"><IconButton icon="edit" label={`Edit connection with ${l.other.name}`} onClick={() => setLinkModal(l)} /><IconButton icon="trash" label={`Remove connection with ${l.other.name}`} onClick={() => setDel({ kind: 'link', item: l })} /></div>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {tree && tree.children.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-medium text-muted">Structure below {tree.name}</h3>
            <ul className="overflow-x-auto pb-2"><StructureNode n={tree} /></ul>
            {structure.data.truncated && <p className="mt-2 text-xs text-muted">Very large structure: only part is shown. Open a sub-unit to continue.</p>}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold">People</h2><p className="text-xs text-muted">{members.total.toLocaleString()} {members.total === 1 ? 'person' : 'people'} connected</p></div>
          <div className="flex items-center gap-2">
            <input type="search" aria-label="Search people in this organization" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-40 rounded-lg border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <Button size="sm" icon="plus" onClick={() => setMemModal(null)}>Add person</Button>
          </div>
        </div>
        {members.error && members.items.length === 0 ? <ErrorState error={members.error} onRetry={members.reload} /> : members.initialLoading ? <LoadingBlock rows={2} /> : members.items.length === 0 ? <p className="text-sm text-muted">{q ? 'Nobody matches that search.' : 'No people are connected to this organization yet.'}</p> : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {members.items.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
                  <Link to={`/profiles/${m.human.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar src={m.human.photoUrl} name={m.human.name} size="sm" gender={m.human.gender} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{m.human.name}</span>
                      <span className="block truncate text-xs text-muted">{[MEMBERSHIP_RELATIONS.find((r) => r.id === m.relation)?.id !== 'MEMBER' && m.relation.toLowerCase(), m.role, span(m)].filter(Boolean).join(' · ') || 'Member'}</span></span>
                  </Link>
                  {m.canManage && <div className="flex shrink-0"><IconButton icon="edit" label={`Edit ${m.human.name}`} onClick={() => setMemModal({ ...m, organization })} /><IconButton icon="trash" label={`Remove ${m.human.name}`} onClick={() => setDel({ kind: 'member', item: m })} /></div>}
                </li>
              ))}
            </ul>
            <InfiniteFooter list={members} label="people" />
          </>
        )}
      </Card>

      {linkModal !== undefined && <OrgLinkModal key={linkModal?.id ?? 'new'} organization={organization} link={linkModal || undefined} onClose={() => setLinkModal(undefined)} onSaved={refresh} />}
      {memModal !== undefined && <MembershipModal key={memModal?.id ?? 'new'} organization={organization} membership={memModal || undefined} onClose={() => setMemModal(undefined)} onSaved={refresh} />}
      <ConfirmDialog open={!!del} danger title="Remove this connection?" message="Neither side is deleted; only the connection is removed." confirmLabel="Remove" loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </>
  );
}
