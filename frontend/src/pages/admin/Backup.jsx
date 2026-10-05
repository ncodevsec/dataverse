import { useState } from 'react';
import { Button, Card } from '../../components/ui.jsx';
import { useToast } from '../../context/AppContext.jsx';

export default function Backup() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/backup', { credentials: 'include', headers: { 'X-Requested-With': 'dataverse' } });
      if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error?.message || `Backup failed (${res.status})`); }
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'dataverse-backup.zip';
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Downloaded ${name}`);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="max-w-2xl space-y-5">
      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold">Full backup</h2>
        <p className="text-sm text-muted">Downloads one date/time-stamped ZIP containing the whole database (<code>database.sql</code>: profiles, contacts, posts, links, users, settings, audit log) and every profile photo as image files in <code>img/</code>. A README with restore steps is included.</p>
        <p className="rounded-xl border border-line bg-warn-soft p-3 text-sm">The file contains personal data (NID numbers, phone numbers) and password hashes. Store it somewhere private and never commit it to Git. Each export is recorded in the audit log.</p>
        <Button variant="primary" icon="download" loading={busy} onClick={download}>Download backup (.zip)</Button>
      </Card>
      <Card className="p-5 text-sm">
        <h2 className="mb-1 text-base font-semibold">Large database or hosting limits?</h2>
        <p className="text-muted">Serverless hosts such as Netlify limit a request to about 10 seconds and 6 MB, so big backups cannot be downloaded here. On your computer, with <code>DATABASE_URL</code> set, run <code>npm run backup</code>: it writes the same ZIP to a <code>backups/</code> folder.</p>
      </Card>
    </div>
  );
}
