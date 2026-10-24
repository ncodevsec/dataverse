import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar, Button, Card, IconButton, cx } from './ui.jsx';
import { DEFAULT_COLUMNS, FIELD_SETS } from '../lib/fields.js';

export const VIEW_MODES = [
  { id: 'grid-h', label: 'Grid – horizontal cards', icon: 'grid' },
  { id: 'grid-v', label: 'Grid – vertical cards', icon: 'columns' },
  { id: 'table', label: 'Compact list (table)', icon: 'list' },
];
const store = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const save = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };

/** Remembered layout for a list page ('people' | 'organization'). Unknown / removed layouts fall back to grid-h. */
export function useViewMode(kind) {
  const key = `dv-view-${kind}`;
  const [view, setView] = useState(() => { const v = store(key, 'grid-h'); return VIEW_MODES.some((m) => m.id === v) ? v : 'grid-h'; });
  return [view, (v) => { setView(v); save(key, v); }];
}
/** Remembered table columns (keys, in order) for a list page. */
export function useColumns(kind) {
  const key = `dv-cols-${kind}`;
  const valid = (arr) => (Array.isArray(arr) ? arr.filter((k) => FIELD_SETS[kind].some((f) => f.key === k)) : null);
  const [cols, setCols] = useState(() => valid(store(key, null)) || DEFAULT_COLUMNS[kind]);
  return [cols, (c) => { setCols(c); save(key, c); }, () => { setCols(DEFAULT_COLUMNS[kind]); save(key, DEFAULT_COLUMNS[kind]); }];
}

export function ViewSwitcher({ value, onChange }) {
  const paths = { grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'], columns: ['M4 3h4v18H4z', 'M10 3h4v18h-4z', 'M16 3h4v18h-4z'], list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'] };
  return (
    <div role="radiogroup" aria-label="Layout" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {VIEW_MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={value === m.id} aria-label={m.label} title={m.label} onClick={() => onChange(m.id)}
          className={cx('inline-flex h-8 w-9 items-center justify-center rounded-md transition-colors', value === m.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink')}>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[m.icon].map((d) => <path key={d} d={d} />)}</svg>
        </button>
      ))}
    </div>
  );
}

/** 3-dot menu: choose which columns the table shows and in what order. */
export function ColumnsMenu({ kind, columns, onChange, onReset }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const all = FIELD_SETS[kind];
  const label = (k) => all.find((f) => f.key === k)?.label;
  const move = (i, d) => { const next = [...columns]; const j = i + d; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const toggle = (k) => onChange(columns.includes(k) ? columns.filter((c) => c !== k) : [...columns, k]);
  return (
    <div ref={ref} className="relative">
      <IconButton icon="dots" label="Table columns" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="border border-line bg-surface" />
      {open && (
        <div role="menu" aria-label="Choose and order columns" className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Columns shown</p>
          <ul className="mb-3 space-y-1">
            {columns.length === 0 && <li className="text-sm text-muted">Only avatar, name and ID.</li>}
            {columns.map((k, i) => (
              <li key={k} className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-sm">
                <span className="flex-1 truncate">{label(k)}</span>
                <IconButton icon="up" label={`Move ${label(k)} earlier`} className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon="down" label={`Move ${label(k)} later`} className="h-7 w-7" disabled={i === columns.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon="x" label={`Hide ${label(k)}`} className="h-7 w-7" onClick={() => toggle(k)} />
              </li>
            ))}
          </ul>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Available</p>
          <ul className="mb-3 max-h-48 space-y-0.5 overflow-y-auto">
            {all.filter((f) => !columns.includes(f.key)).map((f) => (
              <li key={f.key}><button type="button" role="menuitemcheckbox" aria-checked="false" onClick={() => toggle(f.key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-2"><Icon name="plus" className="h-3.5 w-3.5 text-muted" />{f.label}</button></li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" onClick={onReset}>Reset to default</Button>
        </div>
      )}
    </div>
  );
}

/** Clean table: avatar | name | chosen columns | Dataverse ID. */
export function EntityTable({ kind, items, columns, base, photoGender = false }) {
  const fields = columns.map((k) => FIELD_SETS[kind].find((f) => f.key === k)).filter(Boolean);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr><th scope="col" className="w-12 py-2.5 pl-3 pr-1"><span className="sr-only">Photo</span></th><th scope="col" className="px-3 py-2.5 font-medium">Name</th>
            {fields.map((f) => <th key={f.key} scope="col" className="hidden whitespace-nowrap px-3 py-2.5 font-medium sm:table-cell">{f.label}</th>)}
            <th scope="col" className="px-3 py-2.5 text-right font-medium">ID</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((it) => (
            <tr key={it.id} className="group transition-colors hover:bg-surface-2">
              <td className="py-1.5 pl-3 pr-1"><Link to={`${base}/${it.id}`} tabIndex={-1} aria-hidden><Avatar src={it.photoUrl} name={it.name} size="xs" gender={photoGender ? it.gender : undefined} /></Link></td>
              <td className="max-w-[16rem] px-3 py-1.5"><Link to={`${base}/${it.id}`} className="block truncate font-medium group-hover:text-accent">{it.name}</Link>
                {fields.length > 0 && <span className="block truncate text-xs text-muted sm:hidden">{fields.map((f) => f.get(it)).filter(Boolean).slice(0, 2).join(' · ')}</span>}</td>
              {fields.map((f) => <td key={f.key} className="hidden max-w-[14rem] truncate px-3 py-1.5 text-muted sm:table-cell" title={f.get(it) || undefined}>{f.get(it) || '—'}</td>)}
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted">#{it.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
