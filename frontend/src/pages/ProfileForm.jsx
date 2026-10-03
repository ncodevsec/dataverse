import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ProfilePicker from '../components/ProfilePicker.jsx';
import Icon from '../components/Icon.jsx';
import { Avatar, Button, Card, ErrorState, LoadingBlock, PageHeader, SelectField, TextArea, TextField, apiErrors } from '../components/ui.jsx';
import { useAuth, useSite, useToast } from '../context/AppContext.jsx';
import { useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { resizeImage } from '../lib/format.js';

const EMPTY = { name: '', nickname: '', gender: '', maritalStatus: '', dob: '', bloodGroup: '', religion: '', politicalView: '', phone: '', email: '', lineage: '',
  fatherId: null, motherId: null, spouseId: null, presentStreet: '', presentCity: '', street: '', unionName: '', subDistrict: '', district: '', state: '', zip: '', country: '',
  educationLevel: '', educationGroup: '', occupation: '', nid: '', facebook: '', instagram: '', tiktok: '', about: '', tags: '' };
const ADDRESS_FIELDS = ['street', 'unionName', 'subDistrict', 'district', 'state', 'zip', 'country', 'lineage'];

const Section = ({ title, hint, children }) => (
  <Card className="p-5"><h2 className="text-base font-semibold">{title}</h2>{hint && <p className="mb-3 text-sm text-muted">{hint}</p>}<div className={`grid gap-4 sm:grid-cols-2 ${hint ? '' : 'mt-3'}`}>{children}</div></Card>
);

function toForm(p) {
  const f = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) f[k] = p[k] ?? EMPTY[k];
  f.tags = (p.tags || []).join(', ');
  return f;
}

export default function ProfileForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [sp] = useSearchParams();
  useTitle(editing ? 'Edit profile' : 'New profile', useSite().siteName);

  const existing = useFetch(() => (editing ? api.get(`/profiles/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState(EMPTY);
  const [labels, setLabels] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState(null); // staged photo for new profiles
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileRef = useRef(null);

  // populate: edit mode from the API, create mode from query-string (the "Add a child" shortcut)
  useEffect(() => {
    if (editing && existing.data) {
      setForm(toForm(existing.data.profile));
      const fam = existing.data.family;
      setLabels({ fatherId: fam.father?.name, motherId: fam.mother?.name, spouseId: fam.spouse?.name });
    }
  }, [editing, existing.data]);

  useEffect(() => {
    if (editing) return;
    const init = { ...EMPTY };
    for (const k of ['fatherId', 'motherId', 'spouseId']) if (sp.get(k)) init[k] = Number(sp.get(k));
    setForm(init);
    const ids = ['fatherId', 'motherId'].map((k) => sp.get(k)).filter(Boolean);
    ids.forEach((pid) => api.get(`/profiles/${pid}`).then((d) => setLabels((l) => ({ ...l, [sp.get('fatherId') === pid ? 'fatherId' : 'motherId']: d.profile.name }))).catch(() => {}));
    if (sp.get('copyFrom')) api.get(`/profiles/${sp.get('copyFrom')}`).then((d) => setForm((f) => ({ ...f, ...Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, d.profile[k] ?? ''])) }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setId = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    try { const blob = await resizeImage(file); setPhotoFile(blob); setRemovePhoto(false); setPhotoPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); }); }
    catch { toast.error('That image could not be read. Try a JPEG or PNG.'); }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors({});
    const payload = { ...form };
    if (editing && existing.data?.profile.nidHidden) delete payload.nid; // never overwrite a value we were not allowed to see
    payload.tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (!payload.dob) payload.dob = null;
    try {
      const res = editing ? await api.patch(`/profiles/${id}`, payload) : await api.post('/profiles', payload);
      const pid = res.profile.id;
      if (photoFile) await api.upload(`/profiles/${pid}/photo`, photoFile);
      else if (removePhoto && editing) await api.del(`/profiles/${pid}/photo`);
      toast.success(editing ? 'Profile updated' : 'Profile created');
      navigate(`/profiles/${pid}`);
    } catch (err) {
      setErrors(apiErrors(err));
      toast.error(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(false); }
  }

  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  if (editing && existing.loading && !existing.data) return <LoadingBlock rows={5} />;
  if (editing && existing.data && !existing.data.profile.permissions.canEdit) return <ErrorState error={{ message: 'You can only edit profiles you created or that are linked to your account.' }} />;

  const currentPhoto = photoPreview || (!removePhoto && editing ? existing.data?.profile.photoUrl : null);
  const field = (k, label, extra = {}) => <TextField label={label} value={form[k]} onChange={set(k)} error={errors[k]} {...extra} />;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <PageHeader title={editing ? `Edit ${existing.data?.profile.name}` : 'New profile'} subtitle="Only the name is required. Everything else can be added later."
        back={<Link to={editing ? `/profiles/${id}` : '/profiles'} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><Icon name="left" className="h-4 w-4" />Cancel</Link>}
        actions={<Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Create profile'}</Button>} />

      {Object.keys(errors).length > 0 && <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">Some fields need attention: {Object.entries(errors).map(([k, v]) => `${k} (${v})`).join('; ')}</div>}

      <Card className="flex items-center gap-4 p-5">
        <Avatar src={currentPhoto} name={form.name || 'New'} size="xl" />
        <div>
          <h2 className="text-base font-semibold">Photo</h2>
          <p className="mb-3 text-sm text-muted">JPEG, PNG or WebP. It is resized in your browser before upload.</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPickFile} aria-label="Choose photo" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" icon="camera" onClick={() => fileRef.current?.click()}>{currentPhoto ? 'Change photo' : 'Choose photo'}</Button>
            {currentPhoto && <Button type="button" variant="ghost" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setRemovePhoto(true); }}>Remove</Button>}
          </div>
        </div>
      </Card>

      <Section title="Basics">
        {field('name', 'Full name', { required: true, className: 'sm:col-span-2' })}
        {field('nickname', 'Nickname')}
        <SelectField label="Gender" value={form.gender || ''} onChange={set('gender')} error={errors.gender}><option value="">Not specified</option><option value="MALE">Male</option><option value="FEMALE">Female</option></SelectField>
        {field('dob', 'Date of birth', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
        <SelectField label="Blood group" value={form.bloodGroup || ''} onChange={set('bloodGroup')}><option value="">Unknown</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</SelectField>
        <SelectField label="Marital status" value={form.maritalStatus || ''} onChange={set('maritalStatus')}><option value="">Not specified</option><option value="SINGLE">Unmarried</option><option value="MARRIED">Married</option><option value="DIVORCED">Divorced</option><option value="WIDOWED">Widowed</option></SelectField>
        {field('religion', 'Religion')}
        {field('politicalView', 'Political view')}
      </Section>

      <Section title="Family" hint="Search by name or Dataverse ID. Choosing a spouse links both profiles.">
        <ProfilePicker label="Father" value={form.fatherId} onChange={setId('fatherId')} initialLabel={labels.fatherId} error={errors.fatherId} />
        <ProfilePicker label="Mother" value={form.motherId} onChange={setId('motherId')} initialLabel={labels.motherId} error={errors.motherId} />
        <ProfilePicker label="Spouse" value={form.spouseId} onChange={setId('spouseId')} initialLabel={labels.spouseId} error={errors.spouseId} />
        {field('lineage', 'Lineage / house (বংশ/বাড়ি)')}
      </Section>

      <Section title="Contact">
        {field('phone', 'Phone', { type: 'tel', autoComplete: 'off' })}
        {field('email', 'Email', { type: 'email' })}
        {field('facebook', 'Facebook', { hint: 'Profile link or username' })}
        {field('instagram', 'Instagram')}
        {field('tiktok', 'TikTok')}
      </Section>

      <Section title="Permanent address">
        {field('street', 'Street / village', { className: 'sm:col-span-2' })}
        {field('unionName', 'Union')}{field('subDistrict', 'Sub-district (upazila)')}
        {field('district', 'District')}{field('state', 'Division / state')}
        {field('zip', 'ZIP / postal code')}{field('country', 'Country')}
      </Section>

      <Section title="Present address">
        {field('presentStreet', 'Street', { className: 'sm:col-span-2' })}
        {field('presentCity', 'City')}
      </Section>

      <Section title="Education & work">
        {field('educationLevel', 'Education level')}{field('educationGroup', 'Group / subject')}
        {field('occupation', 'Occupation', { className: 'sm:col-span-2' })}
        {existing.data?.profile.nidHidden ? <p className="text-sm text-muted sm:col-span-2">National ID is hidden for your account.</p> : field('nid', 'National ID (NID)', { className: 'sm:col-span-2', hint: isAdmin ? 'Visible to administrators and whoever created this profile' : 'Only you and administrators can see this' })}
      </Section>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">About</h2>
        <div className="grid gap-4">
          <TextArea label="Biography" rows={6} value={form.about} onChange={set('about')} error={errors.about} />
          <TextField label="Tags" value={form.tags} onChange={set('tags')} error={errors.tags} hint="Separate with commas" />
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
        <Button type="button" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Create profile'}</Button>
      </div>
    </form>
  );
}
