import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { DescendantNode, PedigreeNode, Person } from '../components/TreeViews.jsx';
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, SearchInput, SelectField, Tabs, Avatar } from '../components/ui.jsx';
import { useSite } from '../context/AppContext.jsx';
import { useDebounce, useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

function Start() {
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 250);
  const results = useFetch(() => (dq.trim() ? api.get('/profiles/options', { q: dq, limit: 10 }) : Promise.resolve(null)), [dq]);
  const recent = useFetch(() => api.get('/profiles', { sort: 'newest', limit: 6 }), []);
  const list = results.data?.items ?? (dq.trim() ? [] : null);
  return (
    <div>
      <PageHeader title="Shekor" subtitle="Pick a person to see their generations, parents, spouse and children." />
      <SearchInput value={q} onChange={setQ} placeholder="Find a person by name, nickname or ID" autoFocus />
      <div className="mt-5">
        {list ? (list.length === 0 ? <EmptyState title="Nobody matches that search">Try fewer letters, or the person's Dataverse ID.</EmptyState> : <div className="grid gap-2 sm:grid-cols-2">{list.map((p) => <Person key={p.id} p={p} />)}</div>) : (
          <><h2 className="mb-2 text-sm font-medium text-muted">Recently added</h2><div className="grid gap-2 sm:grid-cols-2">{recent.data?.items.map((p) => <Person key={p.id} p={p} />)}</div></>
        )}
      </div>
    </div>
  );
}

function Group({ title, count, children, empty }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-muted">{title}{count !== undefined && ` (${count})`}</h3>
      {children}
      {empty}
    </section>
  );
}

export default function Shekor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { siteName } = useSite();
  const [tab, setTab] = useState('family');
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(2);
  const { data, error, loading, reload } = useFetch(() => (id ? api.get(`/tree/${id}`, { up, down }) : Promise.resolve(null)), [id, up, down]);
  useTitle(data?.focus.name ? `${data.focus.name} · Shekor` : 'Shekor', siteName);

  if (!id) return <Start />;
  if (error) return error.status === 404 ? <EmptyState title="Person not found" action={<LinkButton to="/shekor">Choose someone else</LinkButton>}>That Dataverse ID doesn't exist.</EmptyState> : <ErrorState error={error} onRetry={reload} />;
  if (!data) return <LoadingBlock rows={5} />;

  const { focus, family: f, lineage } = data;
  const spouseRole = focus.gender === 'FEMALE' ? 'Husband' : focus.gender === 'MALE' ? 'Wife' : 'Spouse';
  const childParams = new URLSearchParams({ ...(focus.gender === 'FEMALE' ? { motherId: focus.id, ...(f.spouse ? { fatherId: f.spouse.id } : {}) } : { fatherId: focus.id, ...(f.spouse ? { motherId: f.spouse.id } : {}) }), copyFrom: focus.id });

  return (
    <div className={loading ? 'opacity-70 transition-opacity' : ''}>
      <PageHeader title={focus.name} subtitle="Family tree"
        actions={<><LinkButton to={`/profiles/${focus.id}`} icon="user">Profile</LinkButton><Button variant="ghost" icon="search" onClick={() => navigate('/shekor')}>Another person</Button></>} />

      {/* generation chain (legacy: বংশানুক্রম) */}
      <nav aria-label="Generation chain" className="mb-5 overflow-x-auto rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="flex min-w-max items-center gap-1 text-sm">
          <span className="mr-2 font-medium text-muted">বংশানুক্রম</span>
          {lineage.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              {i > 0 && <Icon name="right" className="h-3.5 w-3.5 text-muted" />}
              {p.id === focus.id ? <Badge tone="accent" className="px-2.5 py-1 text-sm">{p.name}</Badge> : <Link to={`/shekor/${p.id}`} className="rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-accent">{p.name}</Link>}
            </span>
          ))}
        </div>
      </nav>

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'family', label: 'Family' }, { id: 'descendants', label: 'Descendants' }, { id: 'pedigree', label: 'Ancestors' }]} />

      <div className="mt-5">
        {tab === 'family' && (
          <div className="space-y-6">
            <Card className="p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
                <Group title="Parents">
                  <div className="space-y-2">
                    {f.father ? <Person p={f.father} role="Father" /> : <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Father not linked</p>}
                    {f.mother ? <Person p={f.mother} role="Mother" /> : <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Mother not linked</p>}
                  </div>
                </Group>
                <Group title="This person and spouse">
                  <div className="space-y-2">
                    <Person p={focus} focus />
                    {(f.spouses || []).length ? f.spouses.map((s) => <Person key={s.person.id} p={s.person} role={`${spouseRole}${s.endReason ? ` · ${s.endReason.toLowerCase()}` : s.current ? ' · current' : ''}`} />) : <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">No spouse linked</p>}
                  </div>
                </Group>
              </div>
            </Card>
            <Group title="Children" count={f.children.length}
              empty={f.children.length === 0 && <p className="text-sm text-muted">No children linked yet.</p>}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{f.children.map((c) => <Person key={c.id} p={c} />)}</div>
              <LinkButton size="sm" className="mt-3" icon="plus" to={`/profiles/new?${childParams}`}>Add a child</LinkButton>
            </Group>
            {f.siblings.length > 0 && <Group title="Siblings" count={f.siblings.length}><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{f.siblings.map((c) => <Person key={c.id} p={c} />)}</div></Group>}
          </div>
        )}

        {tab === 'descendants' && (
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Use the arrows to expand or collapse a branch. The tree icon re-centres Shekor on that person.</p>
              <SelectField aria-label="Generations to show" className="w-40 shrink-0" value={down} onChange={(e) => setDown(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'generation' : 'generations'}</option>)}</SelectField>
            </div>
            {data.descendants.children.length === 0 ? <EmptyState title="No descendants yet" icon="tree">Children added to this profile will appear here.</EmptyState> : <ul className="overflow-x-auto pb-2"><DescendantNode n={data.descendants} focusId={focus.id} /></ul>}
            {data.truncated && <p className="mt-3 text-xs text-muted">This tree is very large, so only part of it is shown. Open a branch to continue.</p>}
          </Card>
        )}

        {tab === 'pedigree' && (
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Both parents' lines, going back. Scroll sideways on small screens.</p>
              <SelectField aria-label="Generations to show" className="w-40 shrink-0" value={up} onChange={(e) => setUp(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'generation' : 'generations'}</option>)}</SelectField>
            </div>
            {!data.ancestors.father && !data.ancestors.mother ? <EmptyState title="No parents linked" icon="tree" action={<LinkButton to={`/profiles/${focus.id}/edit`}>Link parents</LinkButton>}>Add a father or mother to start the ancestor chart.</EmptyState> : <div className="overflow-x-auto pb-3"><div className="min-w-max"><PedigreeNode n={data.ancestors} /></div></div>}
          </Card>
        )}
      </div>
    </div>
  );
}
