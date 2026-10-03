import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProfileCard from '../components/ProfileCard.jsx';
import { EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, Pagination, SearchInput, SelectField, Button } from '../components/ui.jsx';
import { useAuth, useSite } from '../context/AppContext.jsx';
import { useDebounce, useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function Profiles() {
  const { user } = useAuth();
  useTitle('Profiles', useSite().siteName);
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') || '');
  const dq = useDebounce(text, 300);
  const page = Number(sp.get('page')) || 1;
  const filters = { gender: sp.get('gender') || '', maritalStatus: sp.get('maritalStatus') || '', bloodGroup: sp.get('bloodGroup') || '', district: sp.get('district') || '', tag: sp.get('tag') || '', sort: sp.get('sort') || 'name' };
  const limit = user.preferences?.pageSize || 24;

  const update = (patch, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (resetPage) next.delete('page');
    setSp(next, { replace: true });
  };
  useEffect(() => { if (dq !== (sp.get('q') || '')) update({ q: dq }); /* eslint-disable-next-line */ }, [dq]);

  const facets = useFetch(() => api.get('/profiles/facets'), []);
  const { data, error, loading, reload } = useFetch(
    () => api.get('/profiles', { q: sp.get('q') || '', ...filters, page, limit }), [sp.toString(), limit]);
  const anyFilter = Object.entries(filters).some(([k, v]) => v && k !== 'sort') || sp.get('q');

  return (
    <div>
      <PageHeader title="Profiles" subtitle="Search and browse everyone in the directory."
        actions={<LinkButton to="/profiles/new" variant="primary" icon="plus">Add profile</LinkButton>} />
      <SearchInput value={text} onChange={setText} placeholder="Search by name, nickname, email, phone or ID" />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SelectField aria-label="Gender" value={filters.gender} onChange={(e) => update({ gender: e.target.value })}><option value="">Any gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option></SelectField>
        <SelectField aria-label="Marital status" value={filters.maritalStatus} onChange={(e) => update({ maritalStatus: e.target.value })}><option value="">Any status</option><option value="SINGLE">Unmarried</option><option value="MARRIED">Married</option><option value="DIVORCED">Divorced</option><option value="WIDOWED">Widowed</option></SelectField>
        <SelectField aria-label="Blood group" value={filters.bloodGroup} onChange={(e) => update({ bloodGroup: e.target.value })}><option value="">Any blood</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}</SelectField>
        <SelectField aria-label="District" value={filters.district} onChange={(e) => update({ district: e.target.value })}><option value="">Any district</option>{facets.data?.districts.map((d) => <option key={d.value} value={d.value}>{d.value} ({d.count})</option>)}</SelectField>
        <SelectField aria-label="Tag" value={filters.tag} onChange={(e) => update({ tag: e.target.value })}><option value="">Any tag</option>{facets.data?.tags.map((d) => <option key={d.value} value={d.value}>{d.value} ({d.count})</option>)}</SelectField>
        <SelectField aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'name' ? '' : e.target.value })}><option value="name">Name A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="id">By ID</option></SelectField>
      </div>
      {anyFilter && <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => { setText(''); setSp({}, { replace: true }); }}>Clear search and filters</Button></div>}

      <div className="mt-5">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock rows={6} /> :
          data.items.length === 0 ? <EmptyState title="No profiles found" action={anyFilter ? <Button onClick={() => { setText(''); setSp({}, { replace: true }); }}>Clear filters</Button> : <LinkButton to="/profiles/new" variant="primary">Add the first profile</LinkButton>}>Try a different spelling, a shorter search or fewer filters.</EmptyState> : (
            <div className={loading ? 'opacity-60 transition-opacity' : ''}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((p) => <ProfileCard key={p.id} p={p} />)}</div>
              <Pagination page={data.page} pages={data.pages} total={data.total} label="people" onPage={(p) => { update({ page: p > 1 ? String(p) : '' }, false); window.scrollTo({ top: 0 }); }} />
            </div>
          )}
      </div>
    </div>
  );
}
