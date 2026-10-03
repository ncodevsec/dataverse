import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from './AuthShell.jsx';
import { Button, TextField } from '../components/ui.jsx';
import { useAuth, useSite } from '../context/AppContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const { registrationEnabled } = useSite();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(form.identifier, form.password); navigate(state?.from || '/', { replace: true }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <AuthShell title="Sign in" subtitle="Welcome back."
      footer={registrationEnabled ? <>New here? <Link to="/register" className="font-medium text-accent hover:underline">Create an account</Link></> : null}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm">{error}</div>}
        <TextField label="Email or username" autoComplete="username" autoFocus required value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="text-right text-sm"><Link to="/forgot-password" className="text-accent hover:underline">Forgot password?</Link></div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Sign in</Button>
      </form>
    </AuthShell>
  );
}
