import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, Pagination, SearchInput, SelectField } from '../../components/ui.jsx';
import { useDebounce, useFetch } from '../../hooks/hooks.js';
import { api } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';

export default function Audit() {
  const [text, setText] = useState('');
  const dq = useDebounce(text, 300);
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  useEffect(() => setPage(1), [dq, action]);
  const actions = useFetch(() => api.get('/admin/audit-logs/actions'), []);
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/audit-logs', { q: dq, action, page, limit: 30 }), [dq, action, page]);
  const danger = (a) => /delete|deactivate|password_reset|role_change/.test(a);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="min-w-[14rem] flex-1" value={text} onChange={setText} placeholder="Search by summary or person" />
        <SelectField aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{actions.data?.items.map((a) => <option key={a.action} value={a.action}>{a.action} ({a.count})</option>)}</SelectField>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : data.items.length === 0 ? <EmptyState title="No activity recorded" icon="activity">Important changes such as user, role, profile and settings changes show up here.</EmptyState> : (
        <>
          <Card className="divide-y divide-line">
            {data.items.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                  <Badge tone={danger(a.action) ? 'danger' : 'neutral'}>{a.action}</Badge>
                  <span className="min-w-0 flex-1 text-sm">{a.summary}</span>
                  <span className="text-xs text-muted">{fmtDateTime(a.createdAt)}</span>
                </button>
                <p className="mt-1 text-xs text-muted">{a.actor}{a.ip ? ` · ${a.ip}` : ''}</p>
                {open === a.id && <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{JSON.stringify({ entity: `${a.entityType || '—'} ${a.entityId || ''}`.trim(), ...a.details }, null, 2)}</pre>}
              </div>
            ))}
          </Card>
          <Pagination page={data.page} pages={data.pages} total={data.total} label="events" onPage={setPage} />
        </>
      )}
    </div>
  );
}
