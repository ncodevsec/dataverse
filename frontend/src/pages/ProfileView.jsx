import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, LinkButton, LoadingBlock, Modal, TextArea, TextField, SelectField, apiErrors } from '../components/ui.jsx';
import { useAuth, useSite, useToast } from '../context/AppContext.jsx';
import { useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { age, fmtDate, fmtDateTime, GENDER, MARITAL, safeUrl } from '../lib/format.js';

function Row({ label, children }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="min-w-0 break-words">{children}</dd></div>;
}
const Section = ({ title, children }) => <Card className="p-5"><h2 className="mb-1 text-base font-semibold">{title}</h2><dl className="divide-y divide-line">{children}</dl></Card>;

function RelativeLink({ p, role }) {
  if (!p) return null;
  return (
    <Link to={`/profiles/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line p-2.5 transition-colors hover:border-accent/60">
      <Avatar src={p.photoUrl} name={p.name} size="sm" />
      <div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p>{role && <p className="text-xs text-muted">{role}</p>}</div>
    </Link>
  );
}

function Notes({ profileId, canEdit }) {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(() => api.get(`/profiles/${profileId}/posts`), [profileId]);
  const [editing, setEditing] = useState(null); // null | {} (new) | post
  const [form, setForm] = useState({ title: '', content: '', status: 'published' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  const open = (post) => { setEditing(post || {}); setForm(post ? { title: post.title, content: post.content, status: post.status } : { title: '', content: '', status: 'published' }); setErrors({}); };
  async function save() {
    setBusy(true); setErrors({});
    try {
      if (editing.id) await api.patch(`/posts/${editing.id}`, form); else await api.post(`/profiles/${profileId}/posts`, form);
      toast.success(editing.id ? 'Note updated' : 'Note added'); setEditing(null); reload();
    } catch (e) { setErrors(apiErrors(e)); toast.error(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api.del(`/posts/${del.id}`); toast.success('Note deleted'); setDel(null); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  const items = data?.items || [];
  if (!canEdit && !loading && !items.length) return null;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Notes</h2>{canEdit && <Button size="sm" icon="plus" onClick={() => open()}>Add note</Button>}</div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock rows={1} /> : items.length === 0 ? <p className="text-sm text-muted">No notes yet.</p> : (
        <ul className="space-y-4">
          {items.map((n) => (
            <li key={n.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="font-medium">{n.title} {n.status !== 'published' && <Badge tone="warn">{n.status}</Badge>}</h3><p className="text-xs text-muted">{fmtDateTime(n.createdAt)}</p></div>
                {canEdit && <div className="flex"><IconButton icon="edit" label="Edit note" onClick={() => open(n)} /><IconButton icon="trash" label="Delete note" onClick={() => setDel(n)} /></div>}
              </div>
              {/* rendered as plain text (React escapes it) - never as HTML */}
              <p className="mt-2 whitespace-pre-wrap text-sm">{n.content}</p>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit note' : 'New note'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save note</Button></>}>
        <div className="space-y-3">
          <TextField label="Title" required value={form.title} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextArea label="Content" rows={6} value={form.content} error={errors.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <SelectField label="Visibility" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft (only editors see it)</option><option value="archived">Archived</option></SelectField>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} title="Delete this note?" message={`“${del?.title}” will be permanently removed.`} confirmLabel="Delete note" danger loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </Card>
  );
}

export default function ProfileView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { siteName } = useSite();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(() => api.get(`/profiles/${id}`), [id]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useTitle(data?.profile.name, siteName);

  if (error) return error.status === 404 ? <EmptyState title="Profile not found" action={<LinkButton to="/profiles">Back to profiles</LinkButton>}>This profile may have been removed.</EmptyState> : <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <LoadingBlock rows={5} />;
  const { profile: p, family: f } = data;
  const df = user.preferences?.dateFormat || 'dmy';
  const years = age(p.dob);

  async function remove() {
    setBusy(true);
    try { await api.del(`/profiles/${p.id}`); toast.success(`Deleted ${p.name}`); navigate('/profiles', { replace: true }); } catch (e) { toast.error(e.message); setBusy(false); setConfirm(false); }
  }
  const social = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']].filter(([k]) => p[k]);
  const address = (...parts) => parts.filter(Boolean).join(', ');
  const hasFamily = f.father || f.mother || f.spouse || f.children.length || f.siblings.length;

  return (
    <div className="space-y-5">
      <Link to="/profiles" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><Icon name="left" className="h-4 w-4" />Profiles</Link>

      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <Avatar src={p.photoUrl} name={p.name} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{p.name}</h1>
          <p className="mt-1 text-muted">{[p.nickname && `“${p.nickname}”`, p.occupation].filter(Boolean).join(' · ')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>Dataverse ID #{p.id}</Badge>
            {p.gender && <Badge>{GENDER[p.gender]}</Badge>}
            {p.maritalStatus && <Badge>{MARITAL[p.maritalStatus]}</Badge>}
            {p.bloodGroup && <Badge tone="accent">{p.bloodGroup}</Badge>}
            {p.tags.map((t) => <Link key={t} to={`/profiles?tag=${encodeURIComponent(t)}`}><Badge>{t}</Badge></Link>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton to={`/shekor/${p.id}`} icon="tree" variant="soft">View family tree</LinkButton>
            {p.permissions.canEdit && <LinkButton to={`/profiles/${p.id}/edit`} icon="edit">Edit</LinkButton>}
            {p.permissions.canDelete && <Button icon="trash" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>Delete</Button>}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Personal information">
          <Row label="Date of birth">{p.dob ? `${fmtDate(p.dob, df)}${years !== null ? ` (${years} years)` : ''}` : null}</Row>
          <Row label="Religion">{p.religion}</Row>
          <Row label="Political view">{p.politicalView}</Row>
          <Row label="Lineage / house">{p.lineage}</Row>
          <Row label="National ID">{p.nid}{p.nidHidden && <span className="text-muted">Hidden</span>}</Row>
        </Section>
        <Section title="Contact">
          <Row label="Phone">{p.phone && <a className="text-accent hover:underline" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>}</Row>
          <Row label="Email">{p.email && <a className="text-accent hover:underline" href={`mailto:${p.email}`}>{p.email}</a>}</Row>
          {social.map(([k, label]) => { const href = safeUrl(p[k], k); return <Row key={k} label={label}>{href ? <a className="inline-flex items-center gap-1 break-all text-accent hover:underline" href={href} target="_blank" rel="noopener noreferrer nofollow">{p[k].replace(/^https?:\/\/(www\.)?/, '')}<Icon name="external" className="h-3 w-3" /></a> : p[k]}</Row>; })}
        </Section>
        <Section title="Address">
          <Row label="Present">{address(p.presentStreet, p.presentCity)}</Row>
          <Row label="Permanent">{address(p.street, p.unionName, p.subDistrict, p.district, p.state, p.zip, p.country)}</Row>
        </Section>
        <Section title="Education & work">
          <Row label="Education">{address(p.educationLevel, p.educationGroup)}</Row>
          <Row label="Occupation">{p.occupation}</Row>
        </Section>
      </div>

      {p.about && <Card className="p-5"><h2 className="mb-2 text-base font-semibold">About</h2><p className="whitespace-pre-wrap text-sm">{p.about}</p></Card>}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Family</h2>{hasFamily && <Link to={`/shekor/${p.id}`} className="text-sm text-accent hover:underline">Open in Shekor</Link>}</div>
        {!hasFamily ? <p className="text-sm text-muted">No relatives are linked yet.{p.permissions.canEdit && <> <Link className="text-accent hover:underline" to={`/profiles/${p.id}/edit`}>Link a parent or spouse</Link>.</>}</p> : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <RelativeLink p={f.father} role="Father" /><RelativeLink p={f.mother} role="Mother" />
              <RelativeLink p={f.spouse} role={p.gender === 'FEMALE' ? 'Husband' : p.gender === 'MALE' ? 'Wife' : 'Spouse'} />
            </div>
            {f.children.length > 0 && <div><h3 className="mb-2 text-sm font-medium text-muted">Children ({f.children.length})</h3><div className="grid gap-2 sm:grid-cols-3">{f.children.map((c) => <RelativeLink key={c.id} p={c} />)}</div></div>}
            {f.siblings.length > 0 && <div><h3 className="mb-2 text-sm font-medium text-muted">Siblings ({f.siblings.length})</h3><div className="grid gap-2 sm:grid-cols-3">{f.siblings.map((c) => <RelativeLink key={c.id} p={c} />)}</div></div>}
          </div>
        )}
        {p.permissions.canEdit && (
          <div className="mt-4 border-t border-line pt-4">
            <LinkButton size="sm" icon="plus" to={`/profiles/new?${new URLSearchParams({ ...(p.gender === 'FEMALE' ? { motherId: p.id, ...(p.spouseId ? { fatherId: p.spouseId } : {}) } : { fatherId: p.id, ...(p.spouseId ? { motherId: p.spouseId } : {}) }), copyFrom: p.id })}`}>Add a child</LinkButton>
          </div>
        )}
      </Card>

      <Notes profileId={p.id} canEdit={p.permissions.canEdit} />
      <p className="text-xs text-muted">Last updated {fmtDateTime(p.updatedAt)}</p>

      <ConfirmDialog open={confirm} title={`Delete ${p.name}?`} danger confirmLabel="Delete profile" loading={busy} onConfirm={remove} onClose={() => setConfirm(false)}
        message="This permanently removes the profile, its photo and notes. Relatives stay, but their link to this person is removed. This cannot be undone." />
    </div>
  );
}
