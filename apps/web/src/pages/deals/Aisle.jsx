import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/deals.js';
import { DealCard, Empty, ErrorBox, Freshness, Icon, Skeleton } from '../../components/deals/ui.jsx';

// Standing in the aisle: type one item, get the live price and any coupon.
export default function Lookup() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const res = useQuery({ queryKey: ['deals-lookup', q], queryFn: () => api(`/lookup?q=${encodeURIComponent(q)}`), enabled: q.length >= 2 });

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); }} className="kd-card p-4">
        <label className="kd-label" htmlFor="q">Check one item</label>
        <div className="flex gap-2">
          <input id="q" className="kd-input" placeholder="e.g. cheerios" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="search" autoFocus />
          <button className="kd-btn-primary shrink-0 px-4" aria-label="Search" disabled={text.trim().length < 2}><Icon name="search" /></button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Asks Kroger for the current price at your store.</p>
      </form>

      {res.isFetching && <Skeleton rows={3} />}
      <ErrorBox error={res.error} onRetry={() => res.refetch()} />
      {res.data && !res.isFetching && (
        <>
          <Freshness freshness={res.data.freshness} compact />
          {res.data.limited && <ErrorBox error={{ message: 'The Kroger API daily limit was reached. Showing saved prices only.' }} />}
          {res.data.items.length === 0 ? (
            <Empty title={`Nothing found for "${q}"`}>Try a simpler word. Searched: {res.data.tried.join(', ')}</Empty>
          ) : (
            <div className="space-y-3">
              <p className="px-1 text-xs text-slate-500">{res.data.items.length} results at {res.data.store.name}. Closest matches first.</p>
              {res.data.items.map((i) => <DealCard key={i.upc} item={i} />)}
            </div>
          )}
        </>
      )}
      {!q && <Empty title="Quick price check">Search any product to see its shelf price, sale price, and matching coupons right now.</Empty>}
    </div>
  );
}
