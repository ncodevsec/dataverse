import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { OrgConnectionsCard } from '../components/OrgLinks.jsx';
import { SubjectPosts } from '../components/PostViews.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, LinkButton, LoadingBlock } from '../components/ui.jsx';
import { useAuth, useSite, useToast } from '../context/AppContext.jsx';
import { useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime, safeUrl } from '../lib/format.js';
import { orgTypeLabel } from '../lib/options.js';

function Row({ label, children }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="min-w-0 break-words">{children}</dd></div>;
}
const Section = ({ title, children }) => <Card className="p-5"><h2 className="mb-1 text-base font-semibold">{title}</h2><dl className="divide-y divide-line">{children}</dl></Card>;
const ExtLink = ({ href, children }) => <a className="inline-flex items-center gap-1 break-all text-accent hover:underline" href={href} target="_blank" rel="noopener noreferrer nofollow">{children}<Icon name="external" className="h-3 w-3" /></a>;

export default function OrganizationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { siteName } = useSite();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(() => api.get(`/organizations/${id}`), [id]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useTitle(data?.organization.name, siteName);

  if (error) return error.status === 404 ? <EmptyState title="Organization not found" icon="building" action={<LinkButton to="/organizations">Back to organizations</LinkButton>}>It may have been removed.</EmptyState> : <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <LoadingBlock rows={5} />;
  const o = data.organization;
  const df = user.preferences?.dateFormat || 'dmy';
  const address = (...parts) => parts.filter(Boolean).join(', ');
  const NETWORKS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']];
  const social = NETWORKS.flatMap(([k, label]) => (o.socialLinks?.[k] || []).map((v, i, all) => ({ k, label: all.length > 1 ? `${label} ${i + 1}` : label, value: v })));
  async function remove() {
    setBusy(true);
    try { await api.del(`/organizations/${o.id}`); toast.success(`Deleted ${o.name}`); navigate('/organizations', { replace: true }); } catch (e) { toast.error(e.message); setBusy(false); setConfirm(false); }
  }
  return (
    <div className="space-y-5">
      <Link to="/organizations" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><Icon name="left" className="h-4 w-4" />Organizations</Link>
      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <Avatar src={o.photoUrl} name={o.name} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{o.name}</h1>
          {o.shortName && <p className="mt-1 text-muted">{o.shortName}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="accent">{orgTypeLabel(o.orgType)}</Badge><Badge>Organization ID #{o.id}</Badge>
            {o.dissolvedOn && <Badge>Dissolved</Badge>}
            {o.tags.map((t) => <Link key={t} to={`/organizations?tag=${encodeURIComponent(t)}`}><Badge>{t}</Badge></Link>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {o.permissions.canEdit && <LinkButton to={`/organizations/${o.id}/edit`} icon="edit">Edit</LinkButton>}
            {o.permissions.canDelete && <Button icon="trash" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>Delete</Button>}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Details">
          <Row label="Type">{orgTypeLabel(o.orgType)}</Row>
          <Row label="Founded">{o.foundedOn ? fmtDate(o.foundedOn, df) : null}</Row>
          <Row label="Dissolved">{o.dissolvedOn ? fmtDate(o.dissolvedOn, df) : null}</Row>
        </Section>
        <Section title="Contact">
          <Row label="Phone">{o.phone && <a className="text-accent hover:underline" href={`tel:${o.phone.replace(/[^\d+]/g, '')}`}>{o.phone}</a>}</Row>
          <Row label="Email">{o.email && <a className="text-accent hover:underline" href={`mailto:${o.email}`}>{o.email}</a>}</Row>
          <Row label="Website">{o.website && (safeUrl(o.website, 'website') ? <ExtLink href={safeUrl(o.website, 'website')}>{o.website.replace(/^https?:\/\/(www\.)?/, '')}</ExtLink> : o.website)}</Row>
          {social.map(({ k, label, value }, i) => { const href = safeUrl(value, k); return <Row key={`${k}${i}`} label={label}>{href ? <ExtLink href={href}>{value.replace(/^https?:\/\/(www\.)?/, '')}</ExtLink> : value}</Row>; })}
        </Section>
        <Section title="Address">
          <Row label="Main">{address(o.street, o.unionName, o.subDistrict, o.district, o.state, o.zip, o.country)}</Row>
          <Row label="Office">{address(o.presentStreet, o.presentCity)}</Row>
        </Section>
      </div>

      {o.about && <Card className="p-5"><h2 className="mb-2 text-base font-semibold">About</h2><p className="whitespace-pre-wrap text-sm">{o.about}</p></Card>}

      <OrgConnectionsCard organization={o} />
      <SubjectPosts subject={{ kind: 'organization', id: o.id, name: o.name }} />
      <p className="text-xs text-muted">Last updated {fmtDateTime(o.updatedAt)}</p>

      <ConfirmDialog open={confirm} title={`Delete ${o.name}?`} danger confirmLabel="Delete organization" loading={busy} onConfirm={remove} onClose={() => setConfirm(false)}
        message="This permanently removes the organization, its logo, posts and connections. People and other organizations are not deleted. This cannot be undone." />
    </div>
  );
}
