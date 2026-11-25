import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ago } from '../../api/deals.js';
import { ErrorBox, Freshness, Icon } from '../../components/deals/ui.jsx';

const STATUS_STYLE = { ok: 'text-emerald-700', partial: 'text-amber-700', running: 'text-primary-600', session_expired: 'text-amber-700', failed: 'text-red-700' };

export default function Store() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['deals-settings'], queryFn: () => api('/settings') });
  const status = useQuery({ queryKey: ['deals-sync-status'], queryFn: () => api('/sync/status'), refetchInterval: (q) => (q.state.data?.priceSyncRunning ? 5000 : false) });

  return (
    <div className="space-y-4">
      <StoreCard settings={settings} onSaved={() => { qc.invalidateQueries(); }} />
      <SyncCard status={status} isAdmin={!!settings.data?.isAdmin} onStarted={() => status.refetch()} />
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
    <section className="kd-card space-y-3 p-4">
      <h2 className="font-bold">Your Kroger store</h2>
      <p className="text-xs text-neutral-500">Shared with NutriLabs grocery pricing (Settings, Connections). Changing it here changes it there too.</p>
      {current ? <p className="text-sm">{current.name}<br /><span className="text-slate-500">{current.address}</span></p> : <p className="text-sm text-amber-800">No store chosen yet. Prices need a store.</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); stores.mutate(); }}>
        <input className="kd-input" inputMode="numeric" maxLength={5} placeholder="Zip code" value={z} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} />
        <button className="kd-btn-ghost shrink-0" disabled={z.length !== 5 || stores.isPending}>{stores.isPending ? 'Finding...' : 'Find stores'}</button>
      </form>
      <ErrorBox error={stores.error || save.error} />
      {stores.data && (
        <ul className="space-y-2">
          {stores.data.length === 0 && <li className="text-sm text-slate-600">No Kroger stores within 25 miles.</li>}
          {stores.data.map((s) => (
            <li key={s.locationId}>
              <button className={`w-full rounded-xl p-3 text-left ring-1 ${current?.locationId === s.locationId ? 'bg-primary-50 ring-primary-600' : 'ring-slate-200'}`} onClick={() => save.mutate(s)} disabled={save.isPending}>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-slate-600">{s.address}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {save.isSuccess && <p className="text-sm text-emerald-700">Saved. If this store is new, its prices are syncing now (a few minutes).</p>}
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
    <section className="kd-card space-y-3 p-4">
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
        <button className="kd-btn-ghost w-full" onClick={() => start.mutate()} disabled={start.isPending || d?.priceSyncRunning}>
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

function HelpCard() {
  return (
    <section className="kd-card space-y-2 p-4 text-sm text-slate-700">
      <h2 className="font-bold text-slate-900">How the numbers work</h2>
      <p>Shelf and sale prices come from Kroger's official API for your store, refreshed every night.</p>
      <p>Digital coupons come from Kroger's coupon page, read by the server each night. This app never clips coupons. When a deal needs one, it says so: clip it in the Kroger app before checkout.</p>
      <p>A coupon only lowers a price here when it clearly names the product. Weaker matches show as "might also apply" and are never counted. All totals are estimates.</p>
    </section>
  );
}
