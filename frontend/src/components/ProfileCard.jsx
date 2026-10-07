import { Link } from 'react-router-dom';
import { Avatar, Badge, Card, PhotoImg, cx } from './ui.jsx';
import { MARITAL, initials } from '../lib/format.js';

export const VIEW_MODES = [
  { id: 'grid-h', label: 'Grid – horizontal cards', icon: 'grid' },
  { id: 'grid-v', label: 'Grid – vertical cards', icon: 'columns' },
  { id: 'row-card', label: 'Rows – cards', icon: 'rows' },
  { id: 'row-compact', label: 'Rows – compact list', icon: 'list' },
];

const subline = (p) => [p.occupation, p.district || p.presentCity].filter(Boolean).join(' · ');
const Badges = ({ p }) => (
  <div className="mt-1 flex flex-wrap gap-1.5">
    <Badge>#{p.id}</Badge>
    {p.maritalStatus === 'MARRIED' && <Badge>{MARITAL.MARRIED}</Badge>}
    {p.bloodGroup && <Badge tone="accent">{p.bloodGroup}</Badge>}
    {p.dateOfDeath && <Badge>Deceased</Badge>}
  </div>
);

/** One profile in one of four layouts. `compact` rows are meant to live inside a <ProfileList> wrapper. */
export default function ProfileCard({ p, variant = 'grid-h' }) {
  const sub = subline(p);
  if (variant === 'row-compact') {
    return (
      <Link to={`/profiles/${p.id}`} className="group flex items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-surface-2">
        <Avatar src={p.photoUrl} name={p.name} size="xs" gender={p.gender} />
        <span className="min-w-0 flex-1 truncate text-sm"><span className="font-medium group-hover:text-accent">{p.name}</span>{p.nickname && <span className="text-muted"> “{p.nickname}”</span>}{sub && <span className="hidden text-muted sm:inline"> · {sub}</span>}</span>
        <span className="shrink-0 text-xs text-muted">#{p.id}</span>
      </Link>
    );
  }
  if (variant === 'grid-v') {
    return (
      <Link to={`/profiles/${p.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-accent/60">
        <div className="aspect-square w-full bg-surface-2">
          {p.photoUrl ? <PhotoImg src={p.photoUrl} alt={`Photo of ${p.name}`} gender={p.gender} blurPx={16} />
            : <span aria-hidden className="flex h-full w-full items-center justify-center text-5xl font-semibold text-muted">{initials(p.name)}</span>}
        </div>
        <div className="min-w-0 p-3">
          <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
          <p className="truncate text-sm text-muted">{p.nickname ? `“${p.nickname}”` : ''}{p.nickname && sub ? ' · ' : ''}{sub || (!p.nickname && 'No details yet')}</p>
          <Badges p={p} />
        </div>
      </Link>
    );
  }
  if (variant === 'row-card') {
    return (
      <Link to={`/profiles/${p.id}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent/60">
        <Avatar src={p.photoUrl} name={p.name} size="lg" gender={p.gender} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold group-hover:text-accent">{p.name}{p.nickname && <span className="font-normal text-muted"> “{p.nickname}”</span>}</p>
          <p className="truncate text-sm text-muted">{sub || 'No details yet'}</p>
          <Badges p={p} />
        </div>
        {p.phone && <span className="hidden shrink-0 text-sm text-muted md:block">{p.phone}</span>}
      </Link>
    );
  }
  return (
    <Link to={`/profiles/${p.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-accent/60">
      <Avatar src={p.photoUrl} name={p.name} gender={p.gender} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
        <p className="truncate text-sm text-muted">{p.nickname ? `“${p.nickname}”` : ''}{p.nickname && sub ? ' · ' : ''}{sub || (!p.nickname && 'No details yet')}</p>
        <Badges p={p} />
      </div>
    </Link>
  );
}

/** Lays profiles out for the chosen view mode. */
export function ProfileList({ items, variant }) {
  if (variant === 'row-compact') return <Card className="divide-y divide-line overflow-hidden">{items.map((p) => <ProfileCard key={p.id} p={p} variant={variant} />)}</Card>;
  const cols = { 'grid-h': 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3', 'grid-v': 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', 'row-card': 'grid gap-3' }[variant] || 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
  return <div className={cols}>{items.map((p) => <ProfileCard key={p.id} p={p} variant={variant} />)}</div>;
}

export function ViewSwitcher({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Layout" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {VIEW_MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={value === m.id} aria-label={m.label} title={m.label} onClick={() => onChange(m.id)}
          className={cx('inline-flex h-8 w-9 items-center justify-center rounded-md transition-colors', value === m.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink')}>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {({ grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'], columns: ['M4 3h4v18H4z', 'M10 3h4v18h-4z', 'M16 3h4v18h-4z'], rows: ['M3 4h18v6H3z', 'M3 14h18v6H3z'], list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'] })[m.icon].map((d) => <path key={d} d={d} />)}
          </svg>
        </button>
      ))}
    </div>
  );
}
