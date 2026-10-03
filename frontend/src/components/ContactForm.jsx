import { useEffect, useState } from 'react';
import ProfilePicker from './ProfilePicker.jsx';
import { Button, Modal, TextField, apiErrors } from './ui.jsx';
import { useToast } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';

/** Add / edit a contact. Pass `contact` to edit. */
export default function ContactForm({ open, contact, onClose, onSaved, defaultConnection }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', number: '', connectionId: null, profileId: null });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(contact ? { name: contact.name, number: contact.number, connectionId: contact.connectionId, profileId: contact.profileId } : { name: '', number: '', connectionId: defaultConnection ?? null, profileId: null });
      setErrors({});
    }
  }, [open, contact, defaultConnection]);

  async function save(e) {
    e?.preventDefault();
    setBusy(true); setErrors({});
    try {
      if (contact) await api.patch(`/contacts/${contact.id}`, form); else await api.post('/contacts', form);
      toast.success(contact ? 'Contact updated' : 'Contact added');
      onSaved(); onClose();
    } catch (err) { setErrors(apiErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={contact ? 'Edit contact' : 'Add contact'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{contact ? 'Save changes' : 'Add contact'}</Button></>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <TextField label="Name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label="Phone number" required type="tel" value={form.number} error={errors.number} onChange={(e) => setForm({ ...form, number: e.target.value })} hint="Bangladeshi numbers like 01712345678 are saved as +8801712345678" />
        <ProfilePicker label="Saved by (whose phonebook)" value={form.connectionId} onChange={(v) => setForm({ ...form, connectionId: v })} initialLabel={contact?.relativeName || undefined} error={errors.connectionId} />
        <ProfilePicker label="This number belongs to (optional)" value={form.profileId} onChange={(v) => setForm({ ...form, profileId: v })} initialLabel={contact?.profileName || undefined} error={errors.profileId} hint="Left empty, we link it automatically when the number matches a profile's phone." />
        <button type="submit" className="sr-only">Save</button>
      </form>
    </Modal>
  );
}
