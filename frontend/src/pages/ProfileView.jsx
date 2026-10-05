import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ConnectionsCard, FamilyCard } from '../components/FamilyAndLinks.jsx';
import { PostCard, usePostDialogs } from '../components/PostViews.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, LinkButton, LoadingBlock } from '../components/ui.jsx';
import { useAuth, useSite, useToast } from '../context/AppContext.jsx';
import { useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { age, fmtDate, fmtDateTime, GENDER, MARITAL, safeUrl } from '../lib/format.js';
import { entityLabel } from '../lib/options.js';

function Row({ label, children }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="min-w-0 break-words">{children}</dd></div>;
}
const Section = ({ title, children }) => <Card className="p-5"><h2 className="mb-1 text-base font-semibold">{title}</h2><dl className="divide-y divide-line">{children}</dl></Card>;

function Posts({ profile }) {
  const { data, error, loading, reload } = useFetch(() => api.get(`/profiles/${profile.id}/posts`), [profile.id]);
  const { openNew, openEdit, askDelete, dialogs } = usePostDialogs({ reload, profile: { id: profile.id, name: profile.name } });
  const items = data?.items || [];
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Posts</h2>
        <div className="flex items-center gap-2"><Link to="/posts" className="text-sm text-accent hover:underline">All posts</Link><Button size="sm" icon="plus" onClick={openNew}>New post</Button></div>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock rows={1} /> : items.length === 0 ? <p className="text-sm text-muted">No posts about {profile.name} yet.</p> : (
        <div className="space-y-4">{items.map((n) => <PostCard key={n.id} post={n} showProfile={false} onEdit={openEdit} onDelete={askDelete} />)}</div>
      )}
      {dialogs}
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
  const years = age(p.dob, p.dateOfDeath);

  async function remove() {
    setBusy(true);
    try { await api.del(`/profiles/${p.id}`); toast.success(`Deleted ${p.name}`); navigate('/profiles', { replace: true }); } catch (e) { toast.error(e.message); setBusy(false); setConfirm(false); }
  }
  const NETWORKS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']];
  const social = NETWORKS.flatMap(([k, label]) => (p.socialLinks?.[k] || []).map((v, i, all) => ({ k, label: all.length > 1 ? `${label} ${i + 1}` : label, value: v })));
  const address = (...parts) => parts.filter(Boolean).join(', ');
  const isHuman = p.entityType === 'HUMAN';

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
            {!isHuman && <Badge tone="accent">{entityLabel(p.entityType)}</Badge>}
            {p.gender && <Badge>{GENDER[p.gender]}</Badge>}
            {p.maritalStatus && <Badge>{MARITAL[p.maritalStatus]}</Badge>}
            {p.bloodGroup && <Badge tone="accent">{p.bloodGroup}</Badge>}
            {p.dateOfDeath && <Badge>Deceased</Badge>}
            {p.tags.map((t) => <Link key={t} to={`/profiles?tag=${encodeURIComponent(t)}`}><Badge>{t}</Badge></Link>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {isHuman && <LinkButton to={`/shekor/${p.id}`} icon="tree" variant="soft">View family tree</LinkButton>}
            {p.permissions.canEdit && <LinkButton to={`/profiles/${p.id}/edit`} icon="edit">Edit</LinkButton>}
            {p.permissions.canDelete && <Button icon="trash" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>Delete</Button>}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Personal information">
          <Row label={isHuman ? 'Date of birth' : 'Founded'}>{p.dob ? `${fmtDate(p.dob, df)}${isHuman && years !== null && !p.dateOfDeath ? ` (${years} years)` : ''}` : null}</Row>
          <Row label={isHuman ? 'Date of death' : 'Dissolved'}>{p.dateOfDeath ? `${fmtDate(p.dateOfDeath, df)}${isHuman && years !== null ? ` (aged ${years})` : ''}` : null}</Row>
          <Row label="Religion">{p.religion}</Row>
          <Row label="Political view">{p.politicalView}</Row>
          <Row label="Lineage / house">{p.lineage}</Row>
          <Row label="National ID">{p.nid}{p.nidHidden && <span className="text-muted">Hidden</span>}</Row>
        </Section>
        <Section title="Contact">
          <Row label="Phone">{p.phone && <a className="text-accent hover:underline" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>}</Row>
          <Row label="Email">{p.email && <a className="text-accent hover:underline" href={`mailto:${p.email}`}>{p.email}</a>}</Row>
          <Row label="Contact list">{p.savedContactsCount > 0 ? <LinkButton size="sm" icon="phone" variant="soft" to={`/caller-id?relative=${p.id}`}>View contact list ({p.savedContactsCount.toLocaleString()})</LinkButton> : <span className="text-muted">No contacts saved under this profile</span>}</Row>
          {social.map(({ k, label, value }, i) => { const href = safeUrl(value, k); return <Row key={`${k}${i}`} label={label}>{href ? <a className="inline-flex items-center gap-1 break-all text-accent hover:underline" href={href} target="_blank" rel="noopener noreferrer nofollow">{value.replace(/^https?:\/\/(www\.)?/, '')}<Icon name="external" className="h-3 w-3" /></a> : value}</Row>; })}
        </Section>
        <Section title="Address">
          <Row label="Present">{address(p.presentStreet, p.presentCity)}</Row>
          <Row label="Permanent">{address(p.street, p.unionName, p.subDistrict, p.district, p.state, p.zip, p.country) || (p.inheritedAddress && (
            <span>{address(p.inheritedAddress.street, p.inheritedAddress.unionName, p.inheritedAddress.subDistrict, p.inheritedAddress.district, p.inheritedAddress.state, p.inheritedAddress.zip, p.inheritedAddress.country)}
              <span className="mt-0.5 block text-xs text-muted">Same as <Link className="text-accent hover:underline" to={`/profiles/${p.inheritedAddress.from.id}`}>{p.inheritedAddress.from.name}</Link> (father's side) — add an address to override</span></span>))}</Row>
        </Section>
        <Section title="Education & work">
          <Row label="Education">{address(p.educationLevel, p.educationGroup)}</Row>
          <Row label="Occupation">{p.occupation}</Row>
        </Section>
      </div>

      {p.about && <Card className="p-5"><h2 className="mb-2 text-base font-semibold">About</h2><p className="whitespace-pre-wrap text-sm">{p.about}</p></Card>}

      {isHuman && <FamilyCard p={p} f={f} />}
      <ConnectionsCard profile={p} />

      <Posts profile={p} />
      <p className="text-xs text-muted">Last updated {fmtDateTime(p.updatedAt)}</p>

      <ConfirmDialog open={confirm} title={`Delete ${p.name}?`} danger confirmLabel="Delete profile" loading={busy} onConfirm={remove} onClose={() => setConfirm(false)}
        message="This permanently removes the profile, its photo and notes. Relatives stay, but their link to this person is removed. This cannot be undone." />
    </div>
  );
}
