import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Button, Modal, TextField } from '../components/ui.jsx';
import { confirmHeader } from '../lib/api.js';

const ReauthCtx = createContext(null);
export const useReauth = () => useContext(ReauthCtx);

/**
 * Step-up authentication: `run(reason, (headers) => api.call(..., { headers }))` asks the signed-in user for their own password,
 * runs the call with it, and asks again (showing the error) if the server says it was wrong. Resolves { cancelled: true } if dismissed.
 */
export function ReauthProvider({ children }) {
  const [dlg, setDlg] = useState(null); // { reason, error }
  const [pw, setPw] = useState('');
  const resolver = useRef(null);
  const ask = useCallback((reason, error) => new Promise((resolve) => { resolver.current = resolve; setPw(''); setDlg({ reason, error }); }), []);
  const finish = (value) => { setDlg(null); setPw(''); resolver.current?.(value); resolver.current = null; };
  const run = useCallback(async (reason, fn) => {
    let error = null;
    for (;;) {
      const password = await ask(reason, error);
      if (password === null) return { cancelled: true };
      try { return { value: await fn(confirmHeader(password)) }; } catch (e) { if (e.code === 'REAUTH_FAILED') { error = e.message; continue; } throw e; }
    }
  }, [ask]);
  const value = useMemo(() => ({ run }), [run]);
  return (
    <ReauthCtx.Provider value={value}>
      {children}
      <Modal open={!!dlg} onClose={() => finish(null)} title="Confirm your password" size="sm"
        footer={<><Button onClick={() => finish(null)}>Cancel</Button><Button variant="primary" disabled={!pw} onClick={() => finish(pw)}>Confirm</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); if (pw) finish(pw); }} noValidate>
          <p className="mb-3 text-sm text-muted">{dlg?.reason}</p>
          <p className="mb-3 text-xs text-muted">This action is sensitive, so even though you are signed in as an administrator, please enter your own password again.</p>
          <TextField label="Your password" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} error={dlg?.error} />
          <button type="submit" className="sr-only">Confirm</button>
        </form>
      </Modal>
    </ReauthCtx.Provider>
  );
}
