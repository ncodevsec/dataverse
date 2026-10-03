import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from './AuthShell.jsx';
import { Button, TextField, apiErrors } from '../components/ui.jsx';
import { useAuth, useSite, useToast } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';

export function Register() {
  const { register } = useAuth();
  const { registrationEnabled } = useSite();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    try { await register(form); navigate('/', { replace: true }); }
    catch (err) { setErrors(apiErrors(err)); setError(err.message); } finally { setBusy(false); }
  }

  if (!registrationEnabled) {
    return <AuthShell title="Registration is closed" subtitle="New accounts are currently created by an administrator." footer={<Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>} />;
  }
  return (
    <AuthShell title="Create your account" subtitle="Browse profiles, family trees and the contact directory."
      footer={<>Already registered? <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && !Object.keys(errors).length && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm">{error}</div>}
        <TextField label="Full name" autoComplete="name" required value={form.displayName} onChange={set('displayName')} error={errors.displayName} />
        <TextField label="Username" autoComplete="username" required value={form.username} onChange={set('username')} error={errors.username} hint="Letters, numbers, dots, dashes, underscores" />
        <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <TextField label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} hint="At least 10 characters" />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthShell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/auth/forgot-password', { email }); setDone(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link that works for one hour." footer={<Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>}>
      {done ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm">If an account exists for <b>{email}</b>, a reset link is on its way. If you don't receive it, ask an administrator to reset your password.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm">{error}</div>}
          <TextField label="Email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/auth/reset-password', { token, password }); toast.success('Password updated. Please sign in.'); navigate('/login', { replace: true }); }
    catch (err) { setError(err.details?.password || err.message); } finally { setBusy(false); }
  }
  return (
    <AuthShell title="Choose a new password" footer={<Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>}>
      {!token ? <p className="text-sm text-muted">This reset link is incomplete. Request a new one from the sign-in page.</p> : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm">{error}</div>}
          <TextField label="New password" type="password" autoComplete="new-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 10 characters" />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}
