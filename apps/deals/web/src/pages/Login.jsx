import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

export default function Login({ onSignedIn }) {
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api('/auth/status') });
  const setup = status.data?.needsSetup;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (setup && password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      const user = await api(setup ? '/auth/setup' : '/auth/login', { method: 'POST', body: { username, password } });
      onSignedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-700 px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-bold">KrogerDeals</h1>
          <p className="mt-1 text-sm text-slate-600">
            {setup ? 'First run: create the admin account for this server.' : 'Sign in to see this week\'s deals.'}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="u">Username</label>
          <input id="u" className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="p">Password</label>
          <input id="p" type="password" className="input" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={setup ? 10 : 1} />
          {setup && <p className="mt-1 text-xs text-slate-500">At least 10 characters. This app is reachable from the internet.</p>}
        </div>
        {setup && (
          <div>
            <label className="label" htmlFor="c">Confirm password</label>
            <input id="c" type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || status.isLoading}>{busy ? 'Please wait...' : setup ? 'Create account' : 'Sign in'}</button>
      </form>
    </div>
  );
}
