import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ProfilePicker from '../components/ProfilePicker.jsx';
import Icon from '../components/Icon.jsx';
import PhotoCropper from '../components/PhotoCropper.jsx';
import { Avatar, Button, Card, ErrorState, Field, IconButton, LoadingBlock, PageHeader, SelectField, TextArea, TextField, apiErrors } from '../components/ui.jsx';
import { useAuth, useSite, useToast } from '../context/AppContext.jsx';
import { useFetch, useTitle } from '../hooks/hooks.js';
import { api } from '../lib/api.js';
import { compressImage } from '../lib/image.js';
import { ENTITY_TYPES, POLITICAL_VIEWS, RELIGIONS, withCurrent } from '../lib/options.js';

const NETWORKS = [['facebook', 'Facebook', 'Profile link or username'], ['instagram', 'Instagram', 'Profile link or @username'], ['tiktok', 'TikTok', 'Profile link or @username']];
const emptySocial = () => Object.fromEntries(NETWORKS.map(([k]) => [k, ['']]));
const EMPTY = { entityType: 'HUMAN', name: '', nickname: '', gender: '', maritalStatus: '', dob: '', dateOfDeath: '', bloodGroup: '', religion: '', politicalView: '', phone: '', email: '', lineage: '',
  fatherId: null, motherId: null, spouses: [], presentStreet: '', presentCity: '', street: '', unionName: '', subDistrict: '', district: '', state: '', zip: '', country: '',
  educationLevel: '', educationGroup: '', occupation: '', nid: '', socialLinks: emptySocial(), childIds: [], siblingIds: [], about: '', tags: '' };
const ADDRESS_FIELDS = ['street', 'unionName', 'subDistrict', 'district', 'state', 'zip', 'country', 'lineage'];

const Section = ({ title, hint, children }) => (
  <Card className="p-5"><h2 className="text-base font-semibold">{title}</h2>{hint && <p className="mb-3 text-sm text-muted">{hint}</p>}<div className={`grid gap-4 sm:grid-cols-2 ${hint ? '' : 'mt-3'}`}>{children}</div></Card>
);

function toForm(p, fam) {
  const f = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) f[k] = p[k] ?? EMPTY[k];
  f.tags = (p.tags || []).join(', ');
  f.socialLinks = Object.fromEntries(NETWORKS.map(([k]) => [k, p.socialLinks?.[k]?.length ? [...p.socialLinks[k]] : ['']]));
  f.spouses = (fam?.spouses || []).map((x) => ({ personId: x.person.id, name: x.person.name, marriedOn: x.marriedOn || '', endedOn: x.endedOn || '', endReason: x.endReason || '' }));
  f.childIds = (fam?.children || []).map((c) => c.id);
  f.siblingIds = (fam?.siblings || []).map((c) => c.id);
  return f;
}

const sameIds = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Several accounts of one social network: one input per account, with add / remove. */
function SocialLinksEditor({ value, onChange, errors }) {
  const set = (net, list) => onChange({ ...value, [net]: list });
  return (
    <div className="space-y-5 sm:col-span-2">
      {NETWORKS.map(([net, label, hint]) => {
        const list = value[net] || [''];
        return (
          <fieldset key={net}>
            <legend className="mb-1.5 text-sm font-medium">{label}{list.filter(Boolean).length > 1 && <span className="ml-1 text-muted">({list.filter(Boolean).length} accounts)</span>}</legend>
            <div className="space-y-2">
              {list.map((v, i) => (
                <div key={i} className="flex items-start gap-1">
                  <TextField className="flex-1" aria-label={`${label} account ${i + 1}`} value={v} placeholder={i === 0 ? hint : `Another ${label} account`} maxLength={255}
                    onChange={(e) => set(net, list.map((x, j) => (j === i ? e.target.value : x)))} />
                  {list.length > 1 && <IconButton icon="x" label={`Remove ${label} account ${i + 1}`} className="mt-0.5" onClick={() => set(net, list.filter((_, j) => j !== i))} />}
                </div>
              ))}
            </div>
            {list.length < 10 && <Button type="button" size="sm" variant="ghost" icon="plus" className="mt-1 -ml-2" onClick={() => set(net, [...list, ''])}>Add another {label} account</Button>}
          </fieldset>
        );
      })}
      {errors?.socialLinks && <p className="text-xs text-danger" role="alert">{String(errors.socialLinks)}</p>}
    </div>
  );
}

const END_REASONS = [['', 'Still married'], ['DIVORCED', 'Divorced'], ['WIDOWED', 'Widowed (spouse passed away)'], ['SEPARATED', 'Separated'], ['OTHER', 'Ended (other)']];

/** Any number of spouses over a lifetime: one row per marriage with optional dates and how it ended. */
function SpousesEditor({ value, onChange, selfId, error }) {
  const patch = (i, p) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Field label="Spouses" hint="Add every spouse. Leave 'Still married' for the current one; each marriage is shown separately on the profile." error={error} className="sm:col-span-2">
      {value.length > 0 && (
        <ul className="mb-3 space-y-2">
          {value.map((x, i) => (
            <li key={x.personId} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{x.name || `Profile #${x.personId}`} <span className="font-normal text-muted">#{x.personId}</span></p>
                <IconButton icon="x" label={`Remove spouse ${x.name || x.personId}`} className="h-7 w-7" onClick={() => onChange(value.filter((_, j) => j !== i))} />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <TextField label="Married on" type="date" value={x.marriedOn} onChange={(e) => patch(i, { marriedOn: e.target.value })} />
                <SelectField label="Status" value={x.endReason || (x.endedOn ? 'OTHER' : '')} onChange={(e) => patch(i, { endReason: e.target.value, ...(e.target.value === '' ? { endedOn: '' } : {}) })}>{END_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
                <TextField label="Ended on" type="date" value={x.endedOn} min={x.marriedOn || undefined} disabled={!x.endReason && !x.endedOn} onChange={(e) => patch(i, { endedOn: e.target.value })} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ProfilePicker entityType="HUMAN" label="" value={null} onChange={() => {}} resetOnPick exclude={[...value.map((x) => x.personId), ...(selfId ? [selfId] : [])]} placeholder="Search to add a spouse…"
        onSelect={(p) => onChange([...value, { personId: p.id, name: p.name, marriedOn: '', endedOn: '', endReason: '' }])} />
    </Field>
  );
}

/** A list of linked people (children / siblings) with a search box to add more. */
function RelativesPicker({ label, ids, names, onAdd, onRemove, selfId, hint, error }) {
  return (
    <Field label={label} hint={hint} error={error} className="sm:col-span-2">
      {ids.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {ids.map((rid) => (
            <li key={rid} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm">
              <span>{names[rid] || `Profile #${rid}`} <span className="text-muted">#{rid}</span></span>
              <IconButton icon="x" label={`Remove ${names[rid] || `profile ${rid}`}`} className="h-6 w-6" onClick={() => onRemove(rid)} />
            </li>
          ))}
        </ul>
      )}
      <ProfilePicker entityType="HUMAN" label="" value={null} onChange={() => {}} onSelect={onAdd} resetOnPick exclude={[...ids, ...(selfId ? [selfId] : [])]} placeholder={`Search to add ${label.toLowerCase()}…`} />
    </Field>
  );
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
  const [cropSource, setCropSource] = useState(null); // file being cropped
  const [names, setNames] = useState({}); // id -> name for children / siblings
  const initialRels = useRef({ childIds: [], siblingIds: [], spouses: '[]' });
  const [photoFile, setPhotoFile] = useState(null); // cropped photo waiting to be compressed + uploaded on save
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileRef = useRef(null);

  // populate: edit mode from the API, create mode from query-string (the "Add a child" shortcut)
  useEffect(() => {
    if (editing && existing.data) {
      const fam = existing.data.family;
      const f0 = toForm(existing.data.profile, fam);
      setForm(f0);
      initialRels.current = { childIds: f0.childIds, siblingIds: f0.siblingIds, spouses: JSON.stringify(f0.spouses) };
      setNames(Object.fromEntries([...fam.children, ...fam.siblings].map((c) => [c.id, c.name])));
      setLabels({ fatherId: fam.father?.name, motherId: fam.mother?.name });
    }
  }, [editing, existing.data]);

  useEffect(() => {
    if (editing) return;
    const init = { ...EMPTY };
    for (const k of ['fatherId', 'motherId']) if (sp.get(k)) init[k] = Number(sp.get(k));
    setForm(init);
    const ids = ['fatherId', 'motherId'].map((k) => sp.get(k)).filter(Boolean);
    ids.forEach((pid) => api.get(`/profiles/${pid}`).then((d) => setLabels((l) => ({ ...l, [sp.get('fatherId') === pid ? 'fatherId' : 'motherId']: d.profile.name }))).catch(() => {}));
    if (sp.get('copyFrom')) api.get(`/profiles/${sp.get('copyFrom')}`).then((d) => setForm((f) => ({ ...f, ...Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, d.profile[k] ?? ''])) }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setId = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    setCropSource(file);
  }
  function onCropped(blob) {
    setPhotoFile(blob); setRemovePhoto(false); setCropSource(null);
    setPhotoPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors({});
    const payload = { ...form };
    if (editing && existing.data?.profile.nidHidden) delete payload.nid; // never overwrite a value we were not allowed to see
    payload.tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (!payload.dob) payload.dob = null;
    if (!payload.dateOfDeath) payload.dateOfDeath = null;
    payload.socialLinks = Object.fromEntries(NETWORKS.map(([k]) => [k, (form.socialLinks[k] || []).map((v) => v.trim()).filter(Boolean)]));
    // only send relatives when they were changed, so unrelated edits never touch other people's profiles
    for (const k of ['childIds', 'siblingIds']) if (sameIds(form[k], initialRels.current[k])) delete payload[k];
    if (JSON.stringify(form.spouses) === initialRels.current.spouses) delete payload.spouses;
    else payload.spouses = form.spouses.map((x) => ({ personId: x.personId, marriedOn: x.marriedOn || null, endedOn: x.endedOn || null, endReason: x.endReason || null }));
    if (form.entityType !== 'HUMAN') for (const k of ['fatherId', 'motherId', 'spouses', 'childIds', 'siblingIds']) delete payload[k]; // family links are for people only
    try {
      const res = editing ? await api.patch(`/profiles/${id}`, payload) : await api.post('/profiles', payload);
      const pid = res.profile.id;
      if (photoFile) await api.upload(`/profiles/${pid}/photo`, await compressImage(photoFile)); // compress right before upload
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
  const isHuman = form.entityType === 'HUMAN';
  const field = (k, label, extra = {}) => <TextField label={label} value={form[k]} onChange={set(k)} error={errors[k]} {...extra} />;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <PageHeader title={editing ? `Edit ${existing.data?.profile.name}` : 'New profile'} subtitle="Only the name is required. Everything else can be added later."
        back={<Link to={editing ? `/profiles/${id}` : '/profiles'} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><Icon name="left" className="h-4 w-4" />Cancel</Link>}
        actions={<Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Create profile'}</Button>} />

      {Object.keys(errors).length > 0 && <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">Some fields need attention: {Object.entries(errors).map(([k, v]) => `${k} (${v})`).join('; ')}</div>}

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar src={currentPhoto} name={form.name || 'New'} size="xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Photo</h2>
          <p className="mb-3 text-sm text-muted">JPEG, PNG or WebP. You can crop it, and it is compressed in your browser when you save.</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPickFile} aria-label="Choose photo" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" icon="camera" onClick={() => fileRef.current?.click()}>{currentPhoto ? 'Change photo' : 'Choose photo'}</Button>
            {currentPhoto && <Button type="button" variant="ghost" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setRemovePhoto(true); }}>Remove</Button>}
          </div>
          <TextField className="mt-4" label="Tags" value={form.tags} onChange={set('tags')} error={errors.tags} hint="Separate with commas, e.g. teacher, dhaka, alumni" />
        </div>
      </Card>

      <Section title="Basics">
        <SelectField label="Type" value={form.entityType} onChange={set('entityType')} hint={editing ? undefined : 'Choose what this profile represents. People can have family links; every type can be connected to other entities.'}>
          {ENTITY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </SelectField>
        {field('name', isHuman ? 'Full name' : 'Name', { required: true })}
        {field('nickname', 'Nickname')}
        {isHuman && <SelectField label="Gender" value={form.gender || ''} onChange={set('gender')} error={errors.gender}><option value="">Not specified</option><option value="MALE">Male</option><option value="FEMALE">Female</option></SelectField>}
        {field('dob', isHuman ? 'Date of birth' : 'Founded / established on', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
        {field('dateOfDeath', isHuman ? 'Date of death' : 'Dissolved / ended on', { type: 'date', min: form.dob || undefined, max: new Date().toISOString().slice(0, 10), hint: isHuman ? 'Leave empty if the person is alive' : 'Leave empty if still active' })}
        {isHuman && <SelectField label="Blood group" value={form.bloodGroup || ''} onChange={set('bloodGroup')}><option value="">Unknown</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</SelectField>}
        {isHuman && <SelectField label="Marital status" value={form.maritalStatus || ''} onChange={set('maritalStatus')}><option value="">Not specified</option><option value="SINGLE">Unmarried</option><option value="MARRIED">Married</option><option value="DIVORCED">Divorced</option><option value="WIDOWED">Widowed</option></SelectField>}
        {isHuman && <SelectField label="Religion" value={form.religion || ''} onChange={set('religion')} error={errors.religion}><option value="">Not specified</option>{withCurrent(RELIGIONS, form.religion).map((r) => <option key={r} value={r}>{r}</option>)}</SelectField>}
        {isHuman && <SelectField label="Political view" value={form.politicalView || ''} onChange={set('politicalView')} error={errors.politicalView}><option value="">Not specified</option>{withCurrent(POLITICAL_VIEWS, form.politicalView).map((r) => <option key={r} value={r}>{r}</option>)}</SelectField>}
      </Section>

      {isHuman && (
      <Section title="Family" hint="Search by name or Dataverse ID. Marriages and parent links appear on both profiles.">
        <ProfilePicker entityType="HUMAN" label="Father" value={form.fatherId} onChange={setId('fatherId')} initialLabel={labels.fatherId} error={errors.fatherId} />
        <ProfilePicker entityType="HUMAN" label="Mother" value={form.motherId} onChange={setId('motherId')} initialLabel={labels.motherId} error={errors.motherId} />
        <SpousesEditor value={form.spouses} onChange={(v) => setForm((f) => ({ ...f, spouses: v }))} selfId={editing ? Number(id) : null} error={errors.spouses} />
        {field('lineage', 'Lineage / house (বংশ/বাড়ি)')}
        <RelativesPicker label="Children" ids={form.childIds} names={names} selfId={editing ? Number(id) : null} error={errors.childIds}
          hint="Linking a child sets this person as their father or mother (set the gender first)."
          onAdd={(p) => { setNames((n) => ({ ...n, [p.id]: p.name })); setForm((f) => (f.childIds.includes(p.id) ? f : { ...f, childIds: [...f.childIds, p.id] })); }}
          onRemove={(rid) => setForm((f) => ({ ...f, childIds: f.childIds.filter((x) => x !== rid) }))} />
        <RelativesPicker label="Siblings" ids={form.siblingIds} names={names} selfId={editing ? Number(id) : null} error={errors.siblingIds}
          hint="Siblings share a parent: link a father or mother above first. Adding a sibling gives them the same parents."
          onAdd={(p) => { setNames((n) => ({ ...n, [p.id]: p.name })); setForm((f) => (f.siblingIds.includes(p.id) ? f : { ...f, siblingIds: [...f.siblingIds, p.id] })); }}
          onRemove={(rid) => setForm((f) => ({ ...f, siblingIds: f.siblingIds.filter((x) => x !== rid) }))} />
      </Section>
      )}

      <Section title="Contact">
        {field('phone', 'Phone', { type: 'tel', autoComplete: 'off' })}
        {field('email', 'Email', { type: 'email' })}
        <SocialLinksEditor value={form.socialLinks} onChange={(v) => setForm((f) => ({ ...f, socialLinks: v }))} errors={errors} />
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

      {isHuman && (
      <Section title="Education & work">
        {field('educationLevel', 'Education level')}{field('educationGroup', 'Group / subject')}
        {field('occupation', 'Occupation', { className: 'sm:col-span-2' })}
        {existing.data?.profile.nidHidden ? <p className="text-sm text-muted sm:col-span-2">National ID is hidden for your account.</p> : field('nid', 'National ID (NID)', { className: 'sm:col-span-2', hint: isAdmin ? 'Visible to administrators and whoever created this profile' : 'Only you and administrators can see this' })}
      </Section>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">About</h2>
        <div className="grid gap-4">
          <TextArea label="Biography" rows={6} value={form.about} onChange={set('about')} error={errors.about} />
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
        <Button type="button" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Create profile'}</Button>
      </div>
      <PhotoCropper file={cropSource} onCancel={() => setCropSource(null)} onDone={onCropped} />
    </form>
  );
}
