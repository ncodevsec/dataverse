import { Link } from 'react-router-dom';
import { Avatar, Badge } from './ui.jsx';
import { orgTypeLabel } from '../lib/options.js';

export default function OrgCard({ o }) {
  const sub = [o.district, o.foundedOn && `Founded ${String(o.foundedOn).slice(0, 4)}`].filter(Boolean).join(' · ');
  return (
    <Link to={`/organizations/${o.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-accent/60">
      <Avatar src={o.photoUrl} name={o.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold group-hover:text-accent">{o.name}{o.shortName && <span className="font-normal text-muted"> ({o.shortName})</span>}</p>
        <p className="truncate text-sm text-muted">{sub || 'No details yet'}</p>
        <div className="mt-1 flex flex-wrap gap-1.5"><Badge tone="accent">{orgTypeLabel(o.orgType)}</Badge><Badge>#{o.id}</Badge>{o.dissolvedOn && <Badge>Dissolved</Badge>}</div>
      </div>
    </Link>
  );
}
