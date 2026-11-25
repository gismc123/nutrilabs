import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, shortDate } from '../../api/deals.js';
import { DealCard, Empty, ErrorBox, Freshness, Skeleton } from '../../components/deals/ui.jsx';

const TYPE_LABEL = {
  AMOUNT_OFF: 'Amount off', PERCENT_OFF: 'Percent off', FIXED_PRICE: 'Special price', BOGO: 'Buy one get one',
  FREE_WITH_PURCHASE: 'Free with purchase', POINTS: 'Fuel points', SERVICE: 'Service', UNKNOWN: 'Other',
};

function daysLeft(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export default function Coupons() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [match, setMatch] = useState('grocery');
  const [sort, setSort] = useState('expiry');
  const [open, setOpen] = useState(null);
  const params = new URLSearchParams({ match, sort, ...(q.trim() ? { q: q.trim() } : {}), ...(category ? { category } : {}) });
  const list = useQuery({ queryKey: ['deals-coupons', params.toString()], queryFn: () => api(`/coupons?${params}`) });

  return (
    <div className="space-y-3">
      <div className="kd-card space-y-2 p-3">
        <input className="kd-input" placeholder="Search coupons (brand or product)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className="kd-input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {list.data?.categories?.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </select>
          <select className="kd-input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="expiry">Ending soonest</option>
            <option value="value">Biggest amount off</option>
            <option value="new">Newest</option>
          </select>
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {[['grocery', 'Groceries'], ['matched', 'Matched to products'], ['unmatched', 'Not matched'], ['all', 'Everything']].map(([k, l]) => (
            <button key={k} onClick={() => setMatch(k)} className={`kd-chip min-h-9 shrink-0 px-3 text-sm ${match === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{l}</button>
          ))}
        </div>
      </div>

      {list.data && <Freshness freshness={list.data.freshness} />}
      {list.isLoading && <Skeleton rows={5} />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      {list.data && list.data.coupons.length === 0 && <Empty title="No coupons to show">The coupon worker fills this list. Run it on the server, or loosen the filters.</Empty>}
      {list.data?.coupons.map((c) => {
        const left = daysLeft(c.expiryDate);
        return (
          <div key={c.id} className="kd-card">
            <button className="flex w-full gap-3 p-3 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
              {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-contain" /> : <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-emerald-800">{c.title}</p>
                <p className="line-clamp-2 text-sm">{c.description}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="kd-chip bg-slate-100 text-slate-700">{TYPE_LABEL[c.discountType] || c.discountType}</span>
                  {left != null && <span className={`kd-chip ${left <= 3 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>Ends {shortDate(c.expiryDate)}</span>}
                  {c.minQuantity > 1 && <span className="kd-chip bg-slate-100 text-slate-700">Buy {c.minQuantity}</span>}
                  {c.usageLimit && <span className="kd-chip bg-slate-100 text-slate-700">Use {c.usageLimit}x</span>}
                  {c.pickupDeliveryOnly && <span className="kd-chip bg-slate-200 text-slate-700">Pickup or delivery only</span>}
                  {c.matchStatus === 'matched' && <span className="kd-chip bg-emerald-100 text-emerald-800">{c.productCount} products</span>}
                  {c.matchStatus === 'unmatched' && <span className="kd-chip bg-amber-100 text-amber-900">Not matched to a product yet</span>}
                  {c.clipped && <span className="kd-chip bg-emerald-100 text-emerald-800">Clipped</span>}
                </div>
              </div>
            </button>
            {open === c.id && <CouponDetail id={c.id} />}
          </div>
        );
      })}
      {list.data?.coupons.length >= 300 && <p className="text-center text-xs text-slate-500">Showing the first 300. Search or pick a department to narrow it.</p>}
    </div>
  );
}

function CouponDetail({ id }) {
  const d = useQuery({ queryKey: ['deals-coupon', id], queryFn: () => api(`/coupons/${id}`) });
  if (d.isLoading) return <div className="p-3"><Skeleton rows={1} /></div>;
  if (d.error) return <div className="p-3"><ErrorBox error={d.error} /></div>;
  const { coupon, products } = d.data;
  return (
    <div className="space-y-2 border-t border-slate-100 p-3">
      {coupon.terms && <p className="text-xs text-slate-600">{coupon.terms}</p>}
      {products.length === 0 ? (
        <p className="text-sm text-slate-600">No product at your store could be matched to this coupon with confidence. It may still apply: check the coupon in the Kroger app.</p>
      ) : (
        <>
          <p className="text-sm font-semibold">Products this coupon matches</p>
          {products.slice(0, 15).map((p) => (
            <div key={p.upc}>
              <p className="mb-1 text-xs text-slate-500">{p.confidence === 'high' ? 'Strong match' : 'Possible match'}: {p.reason}</p>
              {p.item ? <DealCard item={p.item} compact /> : <p className="text-sm">{p.name}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
