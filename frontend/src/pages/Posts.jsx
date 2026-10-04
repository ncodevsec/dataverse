import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PostCard, TagChip, usePostDialogs } from '../components/PostViews.jsx';
import { Button, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, SearchInput } from '../components/ui.jsx';
import { useSite } from '../context/AppContext.jsx';
import { useDebounce, useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';

export default function Posts() {
  useTitle('Posts', useSite().siteName);
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') || '');
  const dq = useDebounce(text, 300);
  const tag = sp.get('tag') || '';
  const mine = sp.get('mine') === '1';
  const page = Number(sp.get('page')) || 1;

  const update = (patch, resetPage = true) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); if (resetPage) n.delete('page'); setSp(n, { replace: true }); };
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } update({ q: dq }); /* eslint-disable-next-line */ }, [dq]);

  const tags = useFetch(() => api.get('/posts/tags'), []);
  const { data, error, loading, reload } = useFetch(() => api.get('/posts', { q: sp.get('q') || '', tag, mine: mine ? '1' : '', page, limit: 10 }), [sp.toString()]);
  const refresh = () => { reload(); tags.reload(); };
  const { openNew, openEdit, askDelete, dialogs } = usePostDialogs({ reload: refresh });
  const anyFilter = tag || mine || sp.get('q');

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Posts" subtitle="Stories, news and notes about the people in the directory." actions={<Button variant="primary" icon="plus" onClick={openNew}>New post</Button>} />
      <SearchInput value={text} onChange={setText} placeholder="Search posts by title, text or person" />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => update({ mine: '' })} aria-pressed={!mine} className={`rounded-full px-3 py-1 text-xs font-medium ${!mine ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-ink'}`}>Everyone</button>
        <button type="button" onClick={() => update({ mine: '1' })} aria-pressed={mine} className={`rounded-full px-3 py-1 text-xs font-medium ${mine ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-ink'}`}>My posts</button>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        {tags.data?.items.slice(0, 14).map((t) => (
          <button key={t.value} type="button" onClick={() => update({ tag: tag === t.value ? '' : t.value })} aria-pressed={tag === t.value}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tag === t.value ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent hover:opacity-80'}`}>#{t.value} <span className="opacity-70">{t.count}</span></button>
        ))}
      </div>
      {tag && !tags.data?.items.some((t) => t.value === tag) && <div className="mt-2"><TagChip tag={tag} active /></div>}
      {anyFilter && <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => { setText(''); setSp({}, { replace: true }); }}>Clear search and filters</Button></div>}

      <div className="mt-5">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock rows={4} /> : data.items.length === 0 ? (
          <EmptyState title={anyFilter ? 'No posts match' : 'No posts yet'} icon="list" action={<Button variant="primary" icon="plus" onClick={openNew}>Write the first post</Button>}>
            {anyFilter ? 'Try a different word or tag.' : 'Posts are stories or notes about a person. Markdown and tags are supported.'}</EmptyState>
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <div className="space-y-4">{data.items.map((p) => <PostCard key={p.id} post={p} onEdit={openEdit} onDelete={askDelete} />)}</div>
            <Pagination page={data.page} pages={data.pages} total={data.total} label="posts" onPage={(p) => { update({ page: p > 1 ? String(p) : '' }, false); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
      </div>
      {dialogs}
    </div>
  );
}
