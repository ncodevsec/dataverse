import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

/** Runs an async loader whenever deps change; ignores stale responses. Returns { data, error, loading, reload, setData }. */
export function useFetch(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const tick = useRef(0);
  const run = useCallback(() => {
    const id = ++tick.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(loader())
      .then((data) => { if (id === tick.current) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (id === tick.current && error.name !== 'AbortError') setState((s) => ({ data: s.data, error, loading: false })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); return () => { tick.current++; }; }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useTitle(title, siteName = 'Dataverse') {
  useEffect(() => { document.title = title ? `${title} · ${siteName}` : siteName; }, [title, siteName]);
}

/**
 * Infinite scrolling list. `loader(page)` must return { items, page, pages, total }.
 * The next page is requested when the sentinel (attach `sentinelRef` to an element after the list) comes within ~600px of the viewport.
 * Changing `deps` starts over from page 1; stale responses are ignored; duplicate ids (new records shifting pages) are dropped.
 */
export function useInfiniteList(loader, deps = []) {
  const [state, setState] = useState({ items: [], page: 0, pages: 1, total: 0, loading: true, error: null });
  const seq = useRef(0);
  const busy = useRef(false);
  const node = useRef(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async (page, reset) => {
    const id = reset ? ++seq.current : seq.current;
    busy.current = true;
    setState((s) => ({ ...s, loading: true, error: null, ...(reset ? { items: [], page: 0, pages: 1 } : {}) }));
    try {
      const d = await loaderRef.current(page);
      if (id !== seq.current) return;
      setState((s) => {
        const seen = new Set(reset ? [] : s.items.map((i) => i.id));
        return { items: [...(reset ? [] : s.items), ...d.items.filter((i) => !seen.has(i.id))], page: d.page, pages: d.pages, total: d.total, loading: false, error: null };
      });
    } catch (error) {
      if (id === seq.current && error.name !== 'AbortError') setState((s) => ({ ...s, loading: false, error }));
    } finally { if (id === seq.current) busy.current = false; }
  }, []);

  const loadMore = useCallback(() => {
    if (busy.current) return;
    setState((s) => { if (s.page < s.pages && !s.error) queueMicrotask(() => load(s.page + 1, false)); return s; });
  }, [load]);

  useEffect(() => { load(1, true); return () => { seq.current++; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, deps);

  const supported = typeof IntersectionObserver !== 'undefined';
  const observer = useRef(null);
  const sentinelRef = useCallback((el) => {
    observer.current?.disconnect();
    node.current = el;
    if (el && supported) {
      observer.current = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '600px 0px' });
      observer.current.observe(el);
    }
  }, [loadMore, supported]);
  // a short page can leave the sentinel in view without a new intersection event: check after every load
  useEffect(() => {
    const el = node.current;
    if (!el || state.loading || state.page >= state.pages) return;
    if (el.getBoundingClientRect().top < window.innerHeight + 600) loadMore();
  }, [state.items.length, state.loading, state.page, state.pages, loadMore]);

  return { ...state, hasMore: state.page < state.pages, initialLoading: state.loading && state.items.length === 0, loadingMore: state.loading && state.items.length > 0,
    sentinelRef, loadMore, reload: () => load(1, true), supported };
}
