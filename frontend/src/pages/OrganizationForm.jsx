import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PhotoCropper from '../components/PhotoCropper.jsx';
import SocialLinksEditor, { emptySocial, socialToForm, socialToPayload } from '../components/SocialLinksEditor.jsx';
import { Avatar, Button, Card, ErrorState, LoadingBlock, PageHeader, SelectField, TextArea, TextField, apiErrors } from '../components/ui.jsx';
import { useSite, useToast } from '../context/AppContext.jsx';
import { useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { compressImage } from '../lib/image.js';
import { ORG_TYPES } from '../lib/options.js';

const EMPTY = { orgType: 'ORGANIZATION', name: '', shortName: '', foundedOn: '', dissolvedOn: '', phone: '', email: '', website: '', socialLinks: emptySocial(),
  street: '', unionName: '', subDistrict: '', district: '', state: '', zip: '', country: '', presentStreet: '', presentCity: '', about: '', tags: '' };
const Section = ({ title, hint, children }) => (
  <Card className="p-5"><h2 className="text-base font-semibold">{title}</h2>{hint && <p className="mb-3 text-sm text-muted">{hint}</p>}<div className={`grid gap-4 sm:grid-cols-2 ${hint ? '' : 'mt-3'}`}>{children}</div></Card>
);

export default function OrganizationForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  useTitle(editing ? 'Edit organization' : 'New organization', useSite().siteName);
  const existing = useFetch(() => (editing ? api.get(`/organizations/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!existing.data) return;
    const o = existing.data.organization;
    const f = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) f[k] = o[k] ?? EMPTY[k];
    f.tags = (o.tags || []).join(', '); f.socialLinks = socialToForm(o.socialLinks);
    setForm(f);
  }, [existing.data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = (k, label, extra = {}) => <TextField label={label} value={form[k]} onChange={set(k)} error={errors[k]} {...extra} />;
  function onPickFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    setCropSource(file);
  }
  const onCropped = (blob) => { setPhotoFile(blob); setRemovePhoto(false); setCropSource(null); setPhotoPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); }); };

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErrors({});
    const payload = { ...form, socialLinks: socialToPayload(form.socialLinks), tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) };
    if (!payload.foundedOn) payload.foundedOn = null;
    if (!payload.dissolvedOn) payload.dissolvedOn = null;
    try {
      const res = editing ? await api.patch(`/organizations/${id}`, payload) : await api.post('/organizations', payload);
      const oid = res.organization.id;
      if (photoFile) await api.upload(`/organizations/${oid}/photo`, await compressImage(photoFile));
      else if (removePhoto && editing) await api.del(`/organizations/${oid}/photo`);
      toast.success(editing ? 'Organization updated' : 'Organization created');
      navigate(`/organizations/${oid}`);
    } catch (err) { setErrors(apiErrors(err)); toast.error(err.message); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  }

  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  if (editing && existing.loading && !existing.data) return <LoadingBlock rows={5} />;
  if (editing && existing.data && !existing.data.organization.permissions.canEdit) return <ErrorState error={{ message: 'You can only edit organizations you created.' }} />;
  const currentPhoto = photoPreview || (!removePhoto && editing ? existing.data?.organization.photoUrl : null);

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <PageHeader title={editing ? `Edit ${existing.data?.organization.name}` : 'New organization'} subtitle="Only the name is required. Everything else can be added later."
        back={<Link to={editing ? `/organizations/${id}` : '/organizations'} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><Icon name="left" className="h-4 w-4" />Cancel</Link>}
        actions={<Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Create organization'}</Button>} />
      {Object.keys(errors).length > 0 && <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">Some fields need attention: {Object.entries(errors).map(([k, v]) => `${k} (${v})`).join('; ')}</div>}

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar src={currentPhoto} name={form.name || 'New'} size="xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Logo</h2>
          <p className="mb-3 text-sm text-muted">JPEG, PNG or WebP. You can crop it, and it is compressed in your browser when you save.</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPickFile} aria-label="Choose logo" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" icon="camera" onClick={() => fileRef.current?.click()}>{currentPhoto ? 'Change logo' : 'Choose logo'}</Button>
            {currentPhoto && <Button type="button" variant="ghost" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setRemovePhoto(true); }}>Remove</Button>}
          </div>
          <TextField className="mt-4" label="Tags" value={form.tags} onChange={set('tags')} error={errors.tags} hint="Separate with commas, e.g. politics, dhaka, nonprofit" />
        </div>
      </Card>

      <Section title="Basics">
        <SelectField label="Type" value={form.orgType} onChange={set('orgType')} error={errors.orgType}>{ORG_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</SelectField>
        {field('name', 'Name', { required: true })}
        {field('shortName', 'Short name / acronym')}
        <span className="hidden sm:block" />
        {field('foundedOn', 'Founded on', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
        {field('dissolvedOn', 'Dissolved on', { type: 'date', min: form.foundedOn || undefined, max: new Date().toISOString().slice(0, 10), hint: 'Leave empty if still active' })}
      </Section>

      <Section title="Contact">
        {field('phone', 'Phone', { type: 'tel', autoComplete: 'off' })}
        {field('email', 'Email', { type: 'email' })}
        {field('website', 'Website', { type: 'url', placeholder: 'https://example.org', className: 'sm:col-span-2' })}
        <SocialLinksEditor value={form.socialLinks} onChange={(v) => setForm((f) => ({ ...f, socialLinks: v }))} errors={errors} />
      </Section>

      <Section title="Main address">
        {field('street', 'Street / area', { className: 'sm:col-span-2' })}
        {field('unionName', 'Union')}{field('subDistrict', 'Sub-district (upazila)')}
        {field('district', 'District')}{field('state', 'Division / state')}
        {field('zip', 'ZIP / postal code')}{field('country', 'Country')}
      </Section>
      <Section title="Office address">
        {field('presentStreet', 'Street', { className: 'sm:col-span-2' })}
        {field('presentCity', 'City')}
      </Section>

      <Card className="p-5"><h2 className="mb-3 text-base font-semibold">About</h2><TextArea label="Description" rows={6} value={form.about} onChange={set('about')} error={errors.about} /></Card>

      <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
        <Button type="button" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Create organization'}</Button>
      </div>
      <PhotoCropper file={cropSource} onCancel={() => setCropSource(null)} onDone={onCropped} />
    </form>
  );
}
