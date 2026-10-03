import { Logo } from '../components/ui.jsx';
import { ThemeToggle } from '../components/Layout.jsx';
import { useSite } from '../context/AppContext.jsx';
import { useTitle } from '../hooks/hooks.js';

export default function AuthShell({ title, subtitle, children, footer }) {
  const { siteName, siteDescription } = useSite();
  useTitle(title, siteName);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between border-r border-line bg-surface p-10 lg:flex">
        <div className="flex items-center gap-3"><Logo className="h-9 w-9" /><span className="font-display text-xl font-bold">{siteName}</span></div>
        <div>
          {/* a decorative lineage motif: three generations joined by a single line */}
          <svg viewBox="0 0 320 200" className="mb-8 w-full max-w-sm text-line" aria-hidden>
            <g stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"><path d="M160 44v36M160 80H70v38M160 80h90v38M70 118v22M250 118v22M160 80v38" /></g>
            {[[160, 30, 'var(--accent)'], [70, 130, 'var(--ink)'], [160, 130, 'var(--ink)'], [250, 130, 'var(--ink)'], [70, 170, 'var(--muted)'], [250, 170, 'var(--muted)']].map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r={i === 0 ? 14 : 10} fill="var(--surface)" stroke={c} strokeWidth="2.5" />)}
          </svg>
          <p className="max-w-md font-display text-3xl font-bold leading-tight">Know who is who, and how everyone is connected.</p>
          <p className="mt-3 max-w-md text-muted">{siteDescription}</p>
        </div>
        <p className="text-xs text-muted">Profiles · Shekor family tree · Caller ID</p>
      </aside>
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden"><Logo className="h-8 w-8" /><span className="font-display font-bold">{siteName}</span></div>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
