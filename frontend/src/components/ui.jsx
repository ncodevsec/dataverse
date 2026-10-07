import { useEffect, useId, useRef, forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useSite } from '../context/AppContext.jsx';
import { initials } from '../lib/format.js';

export const cx = (...a) => a.filter(Boolean).join(' ');

// ------------------------------------------------------------------ buttons
const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border-transparent',
  secondary: 'bg-surface text-ink border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface-2',
  danger: 'bg-danger text-white dark:text-[#2b0702] border-transparent hover:opacity-90',
  soft: 'bg-accent-soft text-accent border-transparent hover:opacity-80',
};
export const btnClass = ({ variant = 'secondary', size = 'md', className = '' } = {}) =>
  cx('inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-12 px-5 text-base' : 'h-10 px-4 text-sm', VARIANTS[variant], className);

export function Button({ variant, size, loading, className, children, icon, ...props }) {
  return (
    <button type="button" className={btnClass({ variant, size, className })} {...props} disabled={loading || props.disabled}>
      {loading ? <Spinner className="h-4 w-4" /> : icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
export function LinkButton({ to, variant, size, className, children, icon, ...props }) {
  return <Link to={to} className={btnClass({ variant, size, className })} {...props}>{icon && <Icon name={icon} className="h-4 w-4" />}{children}</Link>;
}
export function IconButton({ icon, label, className, ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink', className)} {...props}>
      <Icon name={icon} className="h-[18px] w-[18px]" />
    </button>
  );
}

// ------------------------------------------------------------------ form fields
const fieldBase = 'w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60';

export function Field({ label, error, hint, required, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">{label}{required && <span className="text-danger" aria-hidden> *</span>}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export const TextField = forwardRef(function TextField({ label, error, hint, className, inputClassName, required, ...props }, ref) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={id}>
      <input id={id} ref={ref} required={required} aria-invalid={!!error} className={cx(fieldBase, 'h-10', error ? 'border-danger' : 'border-line', inputClassName)} {...props} />
    </Field>
  );
});

export function TextArea({ label, error, hint, className, required, rows = 4, ...props }) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={id}>
      <textarea id={id} rows={rows} aria-invalid={!!error} className={cx(fieldBase, 'py-2', error ? 'border-danger' : 'border-line')} {...props} />
    </Field>
  );
}

export function SelectField({ label, error, hint, className, children, selectClassName, ...props }) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <select id={id} aria-invalid={!!error} className={cx(fieldBase, 'h-10 pr-8', error ? 'border-danger' : 'border-line', selectClassName)} {...props}>{children}</select>
    </Field>
  );
}

export function Checkbox({ label, hint, ...props }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)]" {...props} />
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search', className, autoFocus }) {
  return (
    <div className={cx('relative', className)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder}
        className={cx(fieldBase, 'h-11 border-line pl-9')} />
    </div>
  );
}

// ------------------------------------------------------------------ surfaces
export const Card = ({ className, children, ...p }) => <div className={cx('rounded-2xl border border-line bg-surface', className)} {...p}>{children}</div>;

export function Badge({ tone = 'neutral', children, className }) {
  const tones = { neutral: 'bg-surface-2 text-muted', accent: 'bg-accent-soft text-accent', danger: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-ink' };
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export const Skeleton = ({ className }) => <div className={cx('animate-pulse rounded-lg bg-surface-2', className)} />;

export function LoadingBlock({ rows = 4 }) {
  return <div className="space-y-3" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>;
}

export function EmptyState({ title, children, action, icon = 'search' }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name={icon} /></span>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft px-5 py-6 text-center" role="alert">
      <p className="font-medium">We couldn't load this</p>
      <p className="mt-1 text-sm text-muted">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BLUR_PX = { xs: 3, sm: 4, md: 5, lg: 8, xl: 12 };
/** True when this photo must be blurred: the site setting is on and the person is female. */
export function useBlur(gender) { return useSite().blurFemalePhotos && gender === 'FEMALE'; }

/** A photo that is blurred automatically for protected profiles. Fills its parent; the parent decides the shape. */
export function PhotoImg({ src, alt, gender, blurPx = 10, className }) {
  const blurred = useBlur(gender);
  return <img src={src} alt={blurred ? '' : alt} loading="lazy" draggable={!blurred} className={cx('h-full w-full object-cover', blurred && 'scale-125 select-none', className)} style={blurred ? { filter: `blur(${blurPx}px)` } : undefined} />;
}

export function Avatar({ src, name, size = 'md', gender, className }) {
  const dims = { xs: 'h-7 w-7 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-17 w-17 text-sm', lg: 'h-20 w-20 text-xl', xl: 'h-32 w-32 text-3xl' }[size];
  return src ? (
    <span className={cx('inline-block shrink-0 overflow-hidden rounded-full border border-line', dims, className)}><PhotoImg src={src} alt={name ? `Photo of ${name}` : ''} gender={gender} blurPx={BLUR_PX[size]} /></span>
  ) : (
    <span aria-hidden className={cx('inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-semibold text-muted', dims, className)}
      data-gender={gender}>{initials(name)}</span>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            value === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>{t.label}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, to }) {
  const inner = (
    <Card className="p-4 transition-colors hover:border-accent/50">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value ?? '–'}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

// ------------------------------------------------------------------ overlays
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) { // keep focus inside the dialog
        const f = ref.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.querySelector('input,select,textarea,button:not([aria-label="Close"])')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl', w)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button onClick={onClose} disabled={loading}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}>
      <p className="text-sm text-muted">{message}</p>
      {children}
    </Modal>
  );
}

export function Pagination({ page, pages, total, onPage, label = 'results' }) {
  if (!total) return null;
  const nums = [];
  for (let p = Math.max(1, page - 1); p <= Math.min(pages, page + 1); p++) nums.push(p);
  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-sm text-muted">{total.toLocaleString()} {label} · page {page} of {pages}</p>
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" icon="left" />
        {nums[0] > 1 && <><Button size="sm" variant="ghost" onClick={() => onPage(1)}>1</Button>{nums[0] > 2 && <span className="px-1 text-muted">…</span>}</>}
        {nums.map((n) => <Button key={n} size="sm" variant={n === page ? 'primary' : 'ghost'} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</Button>)}
        {nums[nums.length - 1] < pages && <>{nums[nums.length - 1] < pages - 1 && <span className="px-1 text-muted">…</span>}<Button size="sm" variant="ghost" onClick={() => onPage(pages)}>{pages}</Button></>}
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" icon="right" />
      </div>
    </nav>
  );
}

export function Logo({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="rgb(11,132,72)" />
      <g stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"><path d="M16 10v5M16 15H9v4M16 15h7v4" /></g>
      <g fill="rgb(157,231,161)"><circle cx="16" cy="8" r="3" /><circle cx="9" cy="21" r="3" /><circle cx="23" cy="21" r="3" /></g>
    </svg>
  );
}

export const apiErrors = (err) => (err?.details && typeof err.details === 'object' ? err.details : {});

/** Put after an infinite list: observes scrolling, shows a subtle spinner while loading, and an end-of-list note. */
export function InfiniteFooter({ list, label = 'items' }) {
  return (
    <div ref={list.sentinelRef} className="flex min-h-12 items-center justify-center py-4 text-xs text-muted" aria-live="polite">
      {list.error ? <span role="alert">Could not load more. <button type="button" className="text-accent underline" onClick={list.loadMore}>Try again</button></span>
        : list.loadingMore ? <span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" />Loading more…</span>
        : list.hasMore ? (list.supported ? <span aria-hidden className="opacity-0">.</span> : <Button size="sm" onClick={list.loadMore}>Load more</Button>)
        : list.items.length > 0 ? <span>You've reached the end · {list.total.toLocaleString()} {label}</span> : null}
    </div>
  );
}
