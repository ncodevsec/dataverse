import { Link } from 'react-router-dom';
import { EntityTable } from './EntityLists.jsx';
import { Avatar, Badge, PhotoImg } from './ui.jsx';
import { useSite } from '../context/AppContext.jsx';
import { DEFAULT_CARD_FIELDS, fieldValues } from '../lib/fields.js';
import { initials } from '../lib/format.js';

/** The admin chooses which fields cards show (Admin → Site settings). */
export const useCardFields = (kind) => { const f = useSite().cardFields?.[kind]; return Array.isArray(f) ? f : DEFAULT_CARD_FIELDS[kind]; };
export const lineOf = (kind, item, keys) => fieldValues(kind, item, keys).map((v) => (v.key === 'nickname' ? `“${v.text}”` : v.text)).join(' · ');

const Badges = ({ p }) => (
  <div className="mt-1 flex flex-wrap gap-1.5"><Badge>#{p.id}</Badge>{p.dateOfDeath && <Badge>Deceased</Badge>}</div>
);

/** One person as a card: 'grid-h' (photo beside text) or 'grid-v' (large photo on top). */
export default function PeopleCard({ p, variant = 'grid-h' }) {
  const keys = useCardFields('people');
  const line = lineOf('people', p, keys);
  if (variant === 'grid-v') {
    return (
      <Link to={`/peoples/${p.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-accent/60">
        <div className="aspect-square w-full bg-surface-2">
          {p.photoUrl ? <PhotoImg src={p.photoUrl} alt={`Photo of ${p.name}`} gender={p.gender} blurPx={16} />
            : <span aria-hidden className="flex h-full w-full items-center justify-center text-5xl font-semibold text-muted">{initials(p.name)}</span>}
        </div>
        <div className="min-w-0 p-3">
          <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
          <p className="line-clamp-2 text-sm text-muted">{line || 'No details yet'}</p>
          <Badges p={p} />
        </div>
      </Link>
    );
  }
  return (
    <Link to={`/peoples/${p.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-accent/60">
      <Avatar src={p.photoUrl} name={p.name} gender={p.gender} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
        <p className="line-clamp-2 text-sm text-muted">{line || 'No details yet'}</p>
        <Badges p={p} />
      </div>
    </Link>
  );
}

/** Lays peoples out for the chosen view mode. */
export function PeopleList({ items, variant, columns }) {
  if (variant === 'table') return <EntityTable kind="people" items={items} columns={columns} base="/peoples" photoGender />;
  const cls = variant === 'grid-v' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
  return <div className={cls}>{items.map((p) => <PeopleCard key={p.id} p={p} variant={variant} />)}</div>;
}
