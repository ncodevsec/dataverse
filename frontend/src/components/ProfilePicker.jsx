import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useDebounce } from '../hooks/hooks.js';
import { Avatar, Field, IconButton, cx } from './ui.jsx';

/** Searchable single-profile picker (father / mother / spouse / saved-by...). value = profile id or null. */
export default function ProfilePicker({ label, value, onChange, initialLabel, error, hint, placeholder = 'Search by name, nickname or ID', onSelect, resetOnPick = false, exclude = [] }) {
  const id = useId();
  const [selected, setSelected] = useState(value ? { id: value, name: initialLabel || `Profile #${value}` } : null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const dq = useDebounce(q, 250);
  const box = useRef(null);

  useEffect(() => { // keep the label in sync when the parent loads data after mount
    if (!value) setSelected(null);
    else if (!selected || selected.id !== value) setSelected({ id: value, name: initialLabel || `Profile #${value}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initialLabel]);

  useEffect(() => {
    if (!open || dq.trim().length < 1) { setItems([]); return undefined; }
    let live = true;
    api.get('/profiles/options', { q: dq, limit: 8 + exclude.length }).then((d) => { if (live) { setItems(d.items.filter((x) => !exclude.includes(x.id)).slice(0, 8)); setActive(0); } }).catch(() => {});
    return () => { live = false; };
  }, [dq, open]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (p) => { if (!resetOnPick) setSelected(p); onChange(p.id); onSelect?.(p); setQ(''); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <div ref={box} className="relative">
        {selected && !resetOnPick ? (
          <div className="flex h-10 items-center justify-between rounded-lg border border-line bg-surface px-3 text-sm">
            <span className="truncate"><span className="font-medium">{selected.name}</span> <span className="text-muted">#{selected.id}</span></span>
            <IconButton icon="x" label={`Clear ${label}`} className="-mr-2 h-7 w-7" onClick={() => { setSelected(null); onChange(null); }} />
          </div>
        ) : (
          <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} autoComplete="off" value={q} placeholder={placeholder}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
        )}
        {open && !(selected && !resetOnPick) && q.trim() && (
          <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
            {items.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
            {items.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}
                  className={cx('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm', i === active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                  <Avatar src={p.photoUrl} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block truncate text-xs text-muted">#{p.id}{p.nickname ? ` · ${p.nickname}` : ''}{p.district ? ` · ${p.district}` : ''}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
