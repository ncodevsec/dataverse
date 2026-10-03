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
