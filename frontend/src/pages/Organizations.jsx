import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import OrgCard from '../components/OrgCard.jsx';
import { Button, EmptyState, ErrorState, InfiniteFooter, LinkButton, LoadingBlock, PageHeader, SearchInput, SelectField } from '../components/ui.jsx';
import { useSite } from '../context/AppContext.jsx';
import { useDebounce, useFetch, useInfiniteList, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { ORG_TYPES } from '../lib/options.js';

export default function Organizations() {
  useTitle('Organizations', useSite().siteName);
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') || '');
  const dq = useDebounce(text, 300);
  const filters = { orgType: sp.get('orgType') || '', tag: sp.get('tag') || '', sort: sp.get('sort') || 'newest' };
  const update = (patch) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setSp(n, { replace: true }); };
  useEffect(() => { if (dq !== (sp.get('q') || '')) update({ q: dq }); /* eslint-disable-next-line */ }, [dq]);
  const facets = useFetch(() => api.get('/organizations/facets'), []);
  const list = useInfiniteList((page) => api.get('/organizations', { q: sp.get('q') || '', ...filters, page, limit: 24 }), [sp.toString()]);
  const anyFilter = filters.orgType || filters.tag || sp.get('q');
  const clear = () => { setText(''); setSp({}, { replace: true }); };
  return (
    <div>
      <PageHeader title="Organizations" subtitle="Companies, political parties, groups and other organizations."
        actions={<LinkButton to="/organizations/new" variant="primary" icon="plus">Add organization</LinkButton>} />
      <SearchInput value={text} onChange={setText} placeholder="Search by name, short name, website, phone or ID" />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <SelectField aria-label="Type" value={filters.orgType} onChange={(e) => update({ orgType: e.target.value })}><option value="">Any type</option>{ORG_TYPES.map((t) => <option key={t.id} value={t.id}>{t.plural}</option>)}</SelectField>
        <SelectField aria-label="Tag" value={filters.tag} onChange={(e) => update({ tag: e.target.value })}><option value="">Any tag</option>{facets.data?.tags.map((d) => <option key={d.value} value={d.value}>{d.value} ({d.count})</option>)}</SelectField>
        <SelectField aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></SelectField>
      </div>
      {anyFilter && <div className="mt-2"><Button size="sm" variant="ghost" onClick={clear}>Clear search and filters</Button></div>}
      <div className="mt-5">
        {list.error && list.items.length === 0 ? <ErrorState error={list.error} onRetry={list.reload} /> : list.initialLoading ? <LoadingBlock rows={6} /> : list.items.length === 0 ? (
          <EmptyState title="No organizations found" icon="building" action={anyFilter ? <Button onClick={clear}>Clear filters</Button> : <LinkButton to="/organizations/new" variant="primary">Add the first organization</LinkButton>}>Try a different spelling, a shorter search or fewer filters.</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">{list.total.toLocaleString()} {list.total === 1 ? 'organization' : 'organizations'}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.items.map((o) => <OrgCard key={o.id} o={o} />)}</div>
            <InfiniteFooter list={list} label="organizations" />
          </>
        )}
      </div>
    </div>
  );
}
