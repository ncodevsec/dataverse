import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProfileList, VIEW_MODES, ViewSwitcher } from '../components/ProfileCard.jsx';
import { EmptyState, ErrorState, InfiniteFooter, LinkButton, LoadingBlock, PageHeader, SearchInput, SelectField, Button } from '../components/ui.jsx';
import { useAuth, useSite } from '../context/AppContext.jsx';
import { useDebounce, useFetch, useInfiniteList, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VIEW_KEY = 'dv-profiles-view';
const readView = () => { try { const v = localStorage.getItem(VIEW_KEY); return VIEW_MODES.some((m) => m.id === v) ? v : 'grid-h'; } catch { return 'grid-h'; } };

export default function Profiles() {
  const { user } = useAuth();
  useTitle('Profiles', useSite().siteName);
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') || '');
  const dq = useDebounce(text, 300);
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const filters = { gender: sp.get('gender') || '', maritalStatus: sp.get('maritalStatus') || '', bloodGroup: sp.get('bloodGroup') || '', district: sp.get('district') || '', tag: sp.get('tag') || '', sort: sp.get('sort') || 'newest' };
  const limit = view === 'row-compact' ? 60 : user.preferences?.pageSize || 24;

  const update = (patch) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setSp(next, { replace: true });
  };
  useEffect(() => { if (dq !== (sp.get('q') || '')) update({ q: dq }); /* eslint-disable-next-line */ }, [dq]);

  const facets = useFetch(() => api.get('/profiles/facets'), []);
  const list = useInfiniteList((page) => api.get('/profiles', { q: sp.get('q') || '', ...filters, page, limit }), [sp.toString(), limit]);
  const anyFilter = Object.entries(filters).some(([k, v]) => v && k !== 'sort') || sp.get('q');
  const clear = () => { setText(''); setSp({}, { replace: true }); };

  return (
    <div>
      <PageHeader title="Profiles" subtitle="People in the directory. Organizations have their own page."
        actions={<><ViewSwitcher value={view} onChange={setView} /><LinkButton to="/profiles/new" variant="primary" icon="plus">Add profile</LinkButton></>} />
      <SearchInput value={text} onChange={setText} placeholder="Search by name, nickname, email, phone or ID" />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SelectField aria-label="Gender" value={filters.gender} onChange={(e) => update({ gender: e.target.value })}><option value="">Any gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option></SelectField>
        <SelectField aria-label="Marital status" value={filters.maritalStatus} onChange={(e) => update({ maritalStatus: e.target.value })}><option value="">Any status</option><option value="SINGLE">Unmarried</option><option value="MARRIED">Married</option><option value="DIVORCED">Divorced</option><option value="WIDOWED">Widowed</option></SelectField>
        <SelectField aria-label="Blood group" value={filters.bloodGroup} onChange={(e) => update({ bloodGroup: e.target.value })}><option value="">Any blood</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}</SelectField>
        <SelectField aria-label="District" value={filters.district} onChange={(e) => update({ district: e.target.value })}><option value="">Any district</option>{facets.data?.districts.map((d) => <option key={d.value} value={d.value}>{d.value} ({d.count})</option>)}</SelectField>
        <SelectField aria-label="Tag" value={filters.tag} onChange={(e) => update({ tag: e.target.value })}><option value="">Any tag</option>{facets.data?.tags.map((d) => <option key={d.value} value={d.value}>{d.value} ({d.count})</option>)}</SelectField>
        <SelectField aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="id">By ID</option></SelectField>
      </div>
      {anyFilter && <div className="mt-2"><Button size="sm" variant="ghost" onClick={clear}>Clear search and filters</Button></div>}

      <div className="mt-5">
        {list.error && list.items.length === 0 ? <ErrorState error={list.error} onRetry={list.reload} /> : list.initialLoading ? <LoadingBlock rows={6} /> :
          list.items.length === 0 ? <EmptyState title="No profiles found" action={anyFilter ? <Button onClick={clear}>Clear filters</Button> : <LinkButton to="/profiles/new" variant="primary">Add the first profile</LinkButton>}>Try a different spelling, a shorter search or fewer filters.</EmptyState> : (
            <>
              <p className="mb-3 text-sm text-muted">{list.total.toLocaleString()} {list.total === 1 ? 'profile' : 'profiles'}</p>
              <ProfileList items={list.items} variant={view} />
              <InfiniteFooter list={list} label="profiles" />
            </>
          )}
      </div>
    </div>
  );
}
