import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProfileCard from '../components/ProfileCard.jsx';
import OrgCard from '../components/OrgCard.jsx';
import { ContactRow } from './CallerId.jsx';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput } from '../components/ui.jsx';
import { useSite } from '../context/AppContext.jsx';
import { useDebounce, useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

export default function SearchPage() {
  useTitle('Search', useSite().siteName);
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') || '');
  const dq = useDebounce(text, 300);
  useEffect(() => { if (dq !== (sp.get('q') || '')) setSp(dq ? { q: dq } : {}, { replace: true }); /* eslint-disable-next-line */ }, [dq]);
  const q = (sp.get('q') || '').trim();
  const { data, error, loading, reload } = useFetch(() => (q ? api.get('/search', { q, limit: 8 }) : Promise.resolve(null)), [q]);

  return (
    <div>
      <PageHeader title="Search" subtitle="People and contacts in one place." />
      <SearchInput value={text} onChange={setText} placeholder="Name, nickname, ID, email or phone number" autoFocus />
      <div className="mt-6 space-y-8">
        {!q ? <EmptyState title="Start typing to search" icon="search">Partial names and numbers work, in English or Bangla.</EmptyState>
          : error ? <ErrorState error={error} onRetry={reload} />
          : loading && !data ? <LoadingBlock rows={4} /> : data && (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">People</h2><Link to={`/profiles?q=${encodeURIComponent(q)}`} className="text-sm text-accent hover:underline">All matching profiles</Link></div>
                {data.profiles.length === 0 ? <p className="text-sm text-muted">No people match “{q}”.</p> : <div className="grid gap-3 sm:grid-cols-2">{data.profiles.map((p) => <ProfileCard key={p.id} p={p} />)}</div>}
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Organizations</h2><Link to={`/organizations?q=${encodeURIComponent(q)}`} className="text-sm text-accent hover:underline">All matching organizations</Link></div>
                {data.organizations.length === 0 ? <p className="text-sm text-muted">No organizations match “{q}”.</p> : <div className="grid gap-3 sm:grid-cols-2">{data.organizations.map((o) => <OrgCard key={o.id} o={o} />)}</div>}
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Contacts <span className="font-normal text-muted">({data.contactsTotal.toLocaleString()})</span></h2><Link to={`/caller-id?q=${encodeURIComponent(q)}`} className="text-sm text-accent hover:underline">Open in Caller ID</Link></div>
                {data.contacts.length === 0 ? <p className="text-sm text-muted">No contacts match “{q}”.</p> : <Card><ul className="divide-y divide-line">{data.contacts.map((c) => <ContactRow key={c.id} c={c} />)}</ul></Card>}
              </section>
            </>
          )}
      </div>
    </div>
  );
}
