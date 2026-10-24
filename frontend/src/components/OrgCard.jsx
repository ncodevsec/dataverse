import { Link } from 'react-router-dom';
import { EntityTable } from './EntityLists.jsx';
import { lineOf, useCardFields } from './PeopleCard.jsx';
import { Avatar, Badge, PhotoImg } from './ui.jsx';
import { initials } from '../lib/format.js';
import { orgTypeLabel } from '../lib/options.js';

const Badges = ({ o }) => <div className="mt-1 flex flex-wrap gap-1.5"><Badge tone="accent">{orgTypeLabel(o.orgType)}</Badge><Badge>#{o.id}</Badge>{o.dissolvedOn && <Badge>Dissolved</Badge>}</div>;

/** One organization as a card; same two card layouts as people. */
export default function OrgCard({ o, variant = 'grid-h' }) {
  const line = lineOf('organization', o, useCardFields('organization'));
  if (variant === 'grid-v') {
    return (
      <Link to={`/organizations/${o.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-accent/60">
        <div className="aspect-square w-full bg-surface-2">
          {o.photoUrl ? <PhotoImg src={o.photoUrl} alt={`Logo of ${o.name}`} className="object-contain p-3" />
            : <span aria-hidden className="flex h-full w-full items-center justify-center text-5xl font-semibold text-muted">{initials(o.name)}</span>}
        </div>
        <div className="min-w-0 p-3">
          <p className="truncate font-semibold group-hover:text-accent">{o.name}{o.shortName && <span className="font-normal text-muted"> ({o.shortName})</span>}</p>
          <p className="line-clamp-2 text-sm text-muted">{line || 'No details yet'}</p>
          <Badges o={o} />
        </div>
      </Link>
    );
  }
  return (
    <Link to={`/organizations/${o.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-accent/60">
      <Avatar src={o.photoUrl} name={o.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold group-hover:text-accent">{o.name}{o.shortName && <span className="font-normal text-muted"> ({o.shortName})</span>}</p>
        <p className="line-clamp-2 text-sm text-muted">{line || 'No details yet'}</p>
        <Badges o={o} />
      </div>
    </Link>
  );
}

export function OrgList({ items, variant, columns }) {
  if (variant === 'table') return <EntityTable kind="organization" items={items} columns={columns} base="/organizations" />;
  const cls = variant === 'grid-v' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
  return <div className={cls}>{items.map((o) => <OrgCard key={o.id} o={o} variant={variant} />)}</div>;
}
