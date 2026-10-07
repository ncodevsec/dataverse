import { Link } from 'react-router-dom';
import { Avatar, Badge, Card, LinkButton } from './ui.jsx';

export function RelativeLink({ p, role, children }) {
  if (!p) return null;
  return (
    <Link to={`/profiles/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line p-2.5 transition-colors hover:border-accent/60">
      <Avatar src={p.photoUrl} name={p.name} size="sm" gender={p.gender} />
      <div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p>{(role || children) && <p className="text-xs text-muted">{role}{children}</p>}</div>
    </Link>
  );
}

const END_TEXT = { DIVORCED: 'Divorced', WIDOWED: 'Widowed', SEPARATED: 'Separated', OTHER: 'Ended' };
const year = (d) => (d ? String(d).slice(0, 4) : null);
const union = (s) => [s.marriedOn ? `Married ${year(s.marriedOn)}` : null, s.endReason || s.endedOn ? `${END_TEXT[s.endReason] || 'Ended'}${s.endedOn ? ` ${year(s.endedOn)}` : ''}` : s.person.dateOfDeath ? null : 'Current'].filter(Boolean).join(' · ');

/** Parents, then every marriage as its own block with the children of that union, then other children and siblings. */
export function FamilyCard({ p, f }) {
  const spouses = f.spouses || [];
  const otherParent = (c) => (c.fatherId === p.id ? c.motherId : c.fatherId);
  const spouseIds = new Set(spouses.map((s) => s.person.id));
  const strays = f.children.filter((c) => !spouseIds.has(otherParent(c)));
  const hasFamily = f.father || f.mother || spouses.length || f.children.length || f.siblings.length;
  const spouseRole = p.gender === 'FEMALE' ? 'Husband' : p.gender === 'MALE' ? 'Wife' : 'Spouse';
  const addChild = (spouse) => `/profiles/new?${new URLSearchParams({ ...(p.gender === 'FEMALE' ? { motherId: p.id, ...(spouse ? { fatherId: spouse.id } : {}) } : { fatherId: p.id, ...(spouse ? { motherId: spouse.id } : {}) }), copyFrom: p.id })}`;
  const kids = (list) => <div className="grid gap-2 sm:grid-cols-3">{list.map((c) => <RelativeLink key={c.id} p={c} />)}</div>;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Family</h2>{hasFamily && <Link to={`/shekor/${p.id}`} className="text-sm text-accent hover:underline">Open in Shekor</Link>}</div>
      {!hasFamily ? <p className="text-sm text-muted">No relatives are linked yet.{p.permissions.canEdit && <> <Link className="text-accent hover:underline" to={`/profiles/${p.id}/edit`}>Link a parent or spouse</Link>.</>}</p> : (
        <div className="space-y-5">
          {(f.father || f.mother) && <div><h3 className="mb-2 text-sm font-medium text-muted">Parents</h3><div className="grid gap-2 sm:grid-cols-3"><RelativeLink p={f.father} role="Father" /><RelativeLink p={f.mother} role="Mother" /></div></div>}
          {spouses.map((s, i) => {
            const mine = f.children.filter((c) => otherParent(c) === s.person.id);
            return (
              <section key={s.marriageId} className="rounded-xl border border-line p-3" aria-label={`Marriage ${i + 1}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-muted">{spouses.length > 1 ? `${ordinal(i + 1)} marriage` : 'Marriage'}</h3>
                  {s.current && <Badge tone="accent">Current</Badge>}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3"><RelativeLink p={s.person} role={`${spouseRole} · `}>{union(s)}</RelativeLink></div>
                {mine.length > 0 && <div className="mt-3"><h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Children with {s.person.name} ({mine.length})</h4>{kids(mine)}</div>}
                {p.permissions.canEdit && <LinkButton size="sm" variant="ghost" icon="plus" className="mt-2 -ml-2" to={addChild(s.person)}>Add a child with {s.person.name.split(' ')[0]}</LinkButton>}
              </section>
            );
          })}
          {strays.length > 0 && <div><h3 className="mb-2 text-sm font-medium text-muted">{spouses.length ? 'Other children' : 'Children'} ({strays.length})</h3>{kids(strays)}</div>}
          {f.siblings.length > 0 && <div><h3 className="mb-2 text-sm font-medium text-muted">Siblings ({f.siblings.length})</h3>{kids(f.siblings)}</div>}
        </div>
      )}
      {p.permissions.canEdit && <div className="mt-4 border-t border-line pt-4"><LinkButton size="sm" icon="plus" to={addChild(null)}>Add a child</LinkButton></div>}
    </Card>
  );
}
const ordinal = (n) => { const t = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (t[(v - 20) % 10] || t[v] || t[0]); };
