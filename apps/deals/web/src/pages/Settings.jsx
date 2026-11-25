import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ago } from '../api.js';
import { ErrorBox, Freshness, Icon } from '../components/ui.jsx';

const STATUS_STYLE = { ok: 'text-emerald-700', partial: 'text-amber-700', running: 'text-brand-700', session_expired: 'text-amber-700', failed: 'text-red-700' };

export default function Settings({ user }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const status = useQuery({ queryKey: ['sync-status'], queryFn: () => api('/sync/status'), refetchInterval: (q) => (q.state.data?.priceSyncRunning ? 5000 : false) });

  return (
    <div className="space-y-4">
      <StoreCard settings={settings} onSaved={() => { qc.invalidateQueries(); }} />
      <SyncCard status={status} isAdmin={user.isAdmin} onStarted={() => status.refetch()} />
      <NutrilabsCard settings={settings} />
      <AccountCard user={user} onSignedOut={() => qc.setQueryData(['me'], null)} />
      <HelpCard />
    </div>
  );
}

function StoreCard({ settings, onSaved }) {
  const [zip, setZip] = useState('');
  const z = zip || settings.data?.zip || '';
  const stores = useMutation({ mutationFn: () => api(`/stores?zip=${z}`) });
  const save = useMutation({ mutationFn: (store) => api('/settings/store', { method: 'PUT', body: { zip: z, store } }), onSuccess: onSaved });
  const current = settings.data?.store;
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Your Kroger store</h2>
      {current ? <p className="text-sm">{current.name}<br /><span className="text-slate-500">{current.address}</span></p> : <p className="text-sm text-amber-800">No store chosen yet. Prices need a store.</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); stores.mutate(); }}>
        <input className="input" inputMode="numeric" maxLength={5} placeholder="Zip code" value={z} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} />
        <button className="btn-ghost shrink-0" disabled={z.length !== 5 || stores.isPending}>{stores.isPending ? 'Finding...' : 'Find stores'}</button>
      </form>
      <ErrorBox error={stores.error || save.error} />
      {stores.data && (
        <ul className="space-y-2">
          {stores.data.length === 0 && <li className="text-sm text-slate-600">No Kroger stores within 25 miles.</li>}
          {stores.data.map((s) => (
            <li key={s.locationId}>
              <button className={`w-full rounded-xl p-3 text-left ring-1 ${current?.locationId === s.locationId ? 'bg-brand-50 ring-brand-500' : 'ring-slate-200'}`} onClick={() => save.mutate(s)} disabled={save.isPending}>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-slate-600">{s.address}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {save.isSuccess && <p className="text-sm text-emerald-700">Saved. Prices for this store are syncing now.</p>}
    </section>
  );
}

function SyncCard({ status, isAdmin, onStarted }) {
  const start = useMutation({ mutationFn: () => api('/sync/prices', { method: 'POST' }), onSuccess: onStarted });
  const d = status.data;
  const coupons = d?.coupons ?? [];
  const active = coupons.filter((c) => c.status === 'active');
  const n = (pred) => active.filter(pred).reduce((s, c) => s + c.count, 0);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Data and syncing</h2>
      {d && <Freshness freshness={d.freshness} />}
      {d && (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Products priced" value={d.products} />
          <Stat label="On sale now" value={d.deals.onSale} />
          <Stat label="Active coupons" value={n(() => true)} />
          <Stat label="Matched to products" value={n((c) => c.matchStatus === 'matched')} />
          <Stat label="Grocery, not matched" value={n((c) => c.matchStatus === 'unmatched')} />
          <Stat label="Kroger API calls today" value={`${d.krogerApi.products} / ${d.krogerApi.budget}`} />
        </dl>
      )}
      {isAdmin && (
        <button className="btn-ghost w-full" onClick={() => start.mutate()} disabled={start.isPending || d?.priceSyncRunning}>
          <Icon name="refresh" className={`h-5 w-5 ${d?.priceSyncRunning ? 'animate-spin' : ''}`} />
          {d?.priceSyncRunning ? 'Price sync running...' : 'Sync prices now'}
        </button>
      )}
      <ErrorBox error={start.error} />
      {d?.runs?.length > 0 && (
        <details>
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold">Recent sync runs</summary>
          <ul className="space-y-1 text-xs">
            {d.runs.map((r) => (
              <li key={r.id} className="rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="font-semibold capitalize">{r.kind}</span> <span className={STATUS_STYLE[r.status]}>{r.status.replace('_', ' ')}</span> · {ago(r.startedAt)}
                {r.kind === 'coupons' && r.signedIn === false && r.status !== 'session_expired' ? ' · public list' : ''}
                {r.counts && <span className="block text-slate-500">{Object.entries(r.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}</span>}
                {r.error && <span className="block text-red-700">{r.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-bold">{value}</dd>
    </div>
  );
}

function NutrilabsCard({ settings }) {
  const qc = useQueryClient();
  const profiles = useQuery({ queryKey: ['nl-profiles'], queryFn: () => api('/nutrilabs/profiles') });
  const save = useMutation({ mutationFn: (userId) => api('/settings/nutrilabs', { method: 'PUT', body: { userId } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }) });
  const chosen = settings.data?.nutrilabs?.userId;
  if (profiles.data && !profiles.data.configured) {
    return <section className="card p-4 text-sm"><h2 className="font-bold">NutriLabs</h2><p className="mt-1 text-slate-600">Not linked. Set NUTRILABS_URL and NUTRILABS_PRICER_TOKEN on the server to import your weekly grocery list.</p></section>;
  }
  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-bold">NutriLabs grocery list</h2>
      <p className="text-sm text-slate-600">Choose whose meal plan to import on the Deals screen. Their items are also priced every night.</p>
      <ErrorBox error={profiles.error} />
      {profiles.data?.profiles?.length === 0 && <p className="text-sm text-slate-600">No NutriLabs user has a Kroger store set in NutriLabs yet.</p>}
      {profiles.data?.profiles?.map((p) => (
        <button key={p.userId} onClick={() => save.mutate(p.userId)} className={`w-full rounded-xl p-3 text-left ring-1 ${chosen === p.userId ? 'bg-brand-50 ring-brand-500' : 'ring-slate-200'}`}>
          <p className="font-semibold">NutriLabs user #{p.userId} · {p.itemCount} items</p>
          <p className="truncate text-sm text-slate-600">{p.preview.join(', ') || 'No items this week'}</p>
        </button>
      ))}
    </section>
  );
}

function AccountCard({ user, onSignedOut }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [nu, setNu] = useState({ username: '', password: '' });
  const pw = useMutation({ mutationFn: () => api('/auth/password', { method: 'POST', body: { current, next } }), onSuccess: () => { setCurrent(''); setNext(''); } });
  const addUser = useMutation({ mutationFn: () => api('/auth/users', { method: 'POST', body: nu }), onSuccess: () => setNu({ username: '', password: '' }) });
  const logout = useMutation({ mutationFn: () => api('/auth/logout', { method: 'POST' }), onSuccess: onSignedOut });
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Account</h2>
      <p className="text-sm">Signed in as <span className="font-semibold">{user.username}</span>{user.isAdmin ? ' (admin)' : ''}</p>
      <details>
        <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold">Change password</summary>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); pw.mutate(); }}>
          <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <input className="input" type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} minLength={10} />
          <button className="btn-ghost w-full" disabled={pw.isPending}>Update password</button>
          <ErrorBox error={pw.error} />
          {pw.isSuccess && <p className="text-sm text-emerald-700">Password updated.</p>}
        </form>
      </details>
      {user.isAdmin && (
        <details>
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold">Add a household member</summary>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); addUser.mutate(); }}>
            <input className="input" autoCapitalize="none" placeholder="Username" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
            <input className="input" type="password" autoComplete="new-password" placeholder="Password (10+ characters)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
            <button className="btn-ghost w-full" disabled={addUser.isPending}>Add user</button>
            <ErrorBox error={addUser.error} />
            {addUser.isSuccess && <p className="text-sm text-emerald-700">User added.</p>}
          </form>
        </details>
      )}
      <button className="btn-ghost w-full" onClick={() => logout.mutate()}>Sign out</button>
    </section>
  );
}

function HelpCard() {
  return (
    <section className="card space-y-2 p-4 text-sm text-slate-700">
      <h2 className="font-bold text-slate-900">How the numbers work</h2>
      <p>Shelf and sale prices come from Kroger's official API for your store, refreshed every night.</p>
      <p>Digital coupons come from Kroger's coupon page, read by the server each night. This app never clips coupons. When a deal needs one, it says so: clip it in the Kroger app before checkout.</p>
      <p>A coupon only lowers a price here when it clearly names the product. Weaker matches show as "might also apply" and are never counted. All totals are estimates.</p>
    </section>
  );
}
