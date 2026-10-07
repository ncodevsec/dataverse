import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar, cx } from './ui.jsx';

const birthYear = (p) => (p?.dob ? p.dob.slice(0, 4) : null);
const life = (p) => (p?.dob || p?.dateOfDeath ? `${birthYear(p) ? `b. ${birthYear(p)}` : ''}${p.dateOfDeath ? `${birthYear(p) ? ' – ' : ''}d. ${p.dateOfDeath.slice(0, 4)}` : ''}` : null);

/** One person: the name opens their profile, the small tree icon re-centres Shekor on them. */
export function Person({ p, role, focus, className }) {
  if (!p) return null;
  return (
    <div className={cx('flex w-full min-w-0 items-center gap-2.5 rounded-xl border bg-surface p-2', focus ? 'border-accent ring-2 ring-accent/25' : 'border-line', className)}>
      <Link to={`/profiles/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:text-accent" title={`Open ${p.name}'s profile`}>
        <Avatar src={p.photoUrl} name={p.name} size="sm" gender={p.gender} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium leading-tight">{p.name}</span>
          <span className="block truncate text-xs text-muted">{[role, life(p)].filter(Boolean).join(' · ') || `#${p.id}`}</span>
        </span>
      </Link>
      {!focus && <Link to={`/shekor/${p.id}`} className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-accent" aria-label={`Show ${p.name}'s family tree`} title="Show this person's tree"><Icon name="tree" className="h-4 w-4" /></Link>}
    </div>
  );
}

/** Descendants as a collapsible outline with connector lines (readable on phones and desktops alike). */
export function DescendantNode({ n, depth = 0, focusId }) {
  const [open, setOpen] = useState(depth < 2);
  const kids = n.children || [];
  return (
    <li className={depth ? 'tree-item' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        {kids.length > 0 ? (
          <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Collapse ${n.name}` : `Expand ${n.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-muted hover:text-ink">
            <Icon name={open ? 'down' : 'right'} className="h-4 w-4" />
          </button>
        ) : <span className="h-7 w-7 shrink-0" aria-hidden />}
        <div className="grid min-w-0 max-w-full flex-1 gap-1.5 sm:max-w-xl sm:grid-cols-2">
          <Person p={n} focus={n.id === focusId} />
          {(n.spouses || []).map((s) => <Person key={s.person.id} p={s.person} role={`${n.gender === 'MALE' ? 'Wife' : n.gender === 'FEMALE' ? 'Husband' : 'Spouse'}${s.endReason ? ` · ${s.endReason.toLowerCase()}` : ''}`} />)}
        </div>
        {kids.length > 0 && !open && <span className="text-xs text-muted">{kids.length} {kids.length === 1 ? 'child' : 'children'}</span>}
      </div>
      {open && kids.length > 0 && (
        <ul className="tree-list">{kids.map((c) => <DescendantNode key={c.id} n={c} depth={depth + 1} focusId={focusId} />)}</ul>
      )}
    </li>
  );
}

/** Ancestors as a horizontal pedigree: the person on the left, parents stacked to the right, and so on. */
export function PedigreeNode({ n, depth = 0 }) {
  const parents = [n.father && ['Father', n.father], n.mother && ['Mother', n.mother]].filter(Boolean);
  return (
    <div className="ped">
      <div className="w-56 shrink-0"><Person p={n} focus={depth === 0} role={depth === 0 ? undefined : undefined} /></div>
      {parents.length > 0 ? (
        <div className="ped-parents">{parents.map(([, p]) => <PedigreeNode key={p.id} n={p} depth={depth + 1} />)}</div>
      ) : n.hasMoreAncestors ? (
        <Link to={`/shekor/${n.id}`} className="ml-3 whitespace-nowrap text-xs text-accent hover:underline">More ancestors →</Link>
      ) : null}
    </div>
  );
}
