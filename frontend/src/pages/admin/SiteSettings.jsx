import { useEffect, useState } from 'react';
import { Button, Card, Checkbox, ErrorState, LoadingBlock, SelectField, TextArea, TextField, apiErrors } from '../../components/ui.jsx';
import { useSite, useToast } from '../../context/AppContext.jsx';
import { useFetch } from '../../hooks/hooks.js';
import { api } from '../../lib/api.js';

export default function SiteSettings() {
  const toast = useToast();
  const site = useSite();
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/settings'), []);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setForm(data.settings); }, [data]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!form || loading && !data) return <LoadingBlock rows={3} />;
  const set = (k, v) => setForm({ ...form, [k]: v });

  async function save(e) {
    e.preventDefault(); setBusy(true); setErrors({});
    try { await api.put('/admin/settings', form); toast.success('Site settings saved'); site.reload(); reload(); }
    catch (err) { setErrors(apiErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="max-w-2xl space-y-5" noValidate>
      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Identity</h2>
        <TextField label="Site name" value={form.site_name} error={errors.site_name} onChange={(e) => set('site_name', e.target.value)} />
        <TextArea label="Site description" rows={2} value={form.site_description} error={errors.site_description} onChange={(e) => set('site_description', e.target.value)} hint="Shown on the sign-in page and home screen." />
        <TextField label="Contact email" type="email" value={form.contact_email} error={errors.contact_email} onChange={(e) => set('contact_email', e.target.value)} hint="Optional. Where people should ask for help." />
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Access</h2>
        <Checkbox label="Allow new registrations" hint="When off, only administrators can create accounts." checked={form.registration_enabled} onChange={(e) => set('registration_enabled', e.target.checked)} />
        <Checkbox label="Let members add profiles and contacts" hint="Members can always edit what they created. Turn off to make the directory admin-managed." checked={form.allow_user_contributions} onChange={(e) => set('allow_user_contributions', e.target.checked)} />
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Privacy</h2>
        <Checkbox label="Blur female profile photos" hint="When on, every female profile photo on the site is blurred. A member can view the original only by opening that person's profile, clicking the photo and confirming. This hides photos in the interface; it is not a substitute for access control." checked={!!form.blur_female_photos} onChange={(e) => set('blur_female_photos', e.target.checked)} />
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Defaults</h2>
        <SelectField label="Default theme for new accounts" value={form.default_theme} onChange={(e) => set('default_theme', e.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></SelectField>
      </Card>
      <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy}>Save site settings</Button></div>
    </form>
  );
}
