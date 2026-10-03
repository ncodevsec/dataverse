import { Link } from 'react-router-dom';
import { Avatar, Badge } from './ui.jsx';
import { MARITAL } from '../lib/format.js';

export default function ProfileCard({ p }) {
  const sub = [p.occupation, p.district || p.presentCity].filter(Boolean).join(' · ');
  return (
    <Link to={`/profiles/${p.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-accent/60">
      <Avatar src={p.photoUrl} name={p.name} gender={p.gender} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
        <p className="truncate text-sm text-muted">{p.nickname ? `“${p.nickname}”` : ''}{p.nickname && sub ? ' · ' : ''}{sub || (!p.nickname && 'No details yet')}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge>#{p.id}</Badge>
          {p.maritalStatus === 'MARRIED' && <Badge>{MARITAL.MARRIED}</Badge>}
          {p.bloodGroup && <Badge tone="accent">{p.bloodGroup}</Badge>}
        </div>
      </div>
    </Link>
  );
}
