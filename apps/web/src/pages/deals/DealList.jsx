import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, money } from '../../api/deals.js';
import { Empty, ErrorBox, Icon, Skeleton } from '../../components/deals/ui.jsx';

export default function DealList() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['deals-list'], queryFn: () => api('/list') });
  const [name, setName] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['deals-list'] });
  const patch = useMutation({ mutationFn: ({ id, ...body }) => api(`/list/${id}`, { method: 'PATCH', body }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id) => api(`/list/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const clear = useMutation({ mutationFn: (checked) => api(`/list${checked ? '?checked=true' : ''}`, { method: 'DELETE' }), onSuccess: refresh });
  const add = useMutation({ mutationFn: (n) => api('/list', { method: 'POST', body: { name: n } }), onSuccess: () => { setName(''); refresh(); } });

  const items = list.data ?? [];
  const total = items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity, 0);
  const regular = items.reduce((s, i) => s + (i.regular ?? i.unitPrice ?? 0) * i.quantity, 0);
  const toClip = items.filter((i) => i.needsClip && !i.checked);

  return (
    <div className="space-y-3">
      <form className="kd-card flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(name.trim()); }}>
        <input className="kd-input" placeholder="Add anything to the list" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="kd-btn-primary shrink-0 px-3" aria-label="Add"><Icon name="plus" /></button>
      </form>

      {list.isLoading && <Skeleton rows={3} />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />

      {items.length > 0 && (
        <div className="kd-card flex items-center justify-between p-4">
          <div>
            <p className="text-sm text-slate-600">Estimated total</p>
            <p className="text-2xl font-bold">{money(total)}</p>
          </div>
          {regular - total > 0.005 && <p className="text-right text-sm font-semibold text-emerald-700">You save about<br />{money(regular - total)}</p>}
        </div>
      )}

      {toClip.length > 0 && (
        <div className="kd-card border-l-4 border-amber-400 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-amber-900"><Icon name="scissors" className="h-4 w-4" />Before checkout, clip {toClip.length} coupon{toClip.length === 1 ? '' : 's'} in the Kroger app</p>
          <ul className="mt-1 list-disc pl-5 text-amber-900">{toClip.map((i) => <li key={i.id}>{i.note?.replace(/^Coupon: /, '') || i.name}</li>)}</ul>
        </div>
      )}

      {list.data && items.length === 0 && <Empty title="Your list is empty">Add deals or a whole bundle from Find deals. Items keep the sale price and say which coupons to clip.</Empty>}

      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className={`kd-card flex items-center gap-3 p-3 ${i.checked ? 'opacity-60' : ''}`}>
            <button className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-2 ${i.checked ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white ring-slate-300'}`} onClick={() => patch.mutate({ id: i.id, checked: !i.checked })} aria-label={i.checked ? 'Mark not bought' : 'Mark bought'}>
              {i.checked && <Icon name="check" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium leading-snug ${i.checked ? 'line-through' : ''}`}>{i.name}</p>
              <p className="text-xs text-slate-500">
                {i.unitPrice != null ? `${i.quantity} x ${money(i.unitPrice)}` : `Qty ${i.quantity}`}
                {i.needsClip ? ' · clip coupon' : ''}
              </p>
              {i.note && <p className="line-clamp-1 text-xs text-slate-500">{i.note}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button className="h-9 w-9 rounded-lg text-lg font-bold ring-1 ring-slate-300" onClick={() => i.quantity > 1 ? patch.mutate({ id: i.id, quantity: i.quantity - 1 }) : remove.mutate(i.id)} aria-label="Less">-</button>
              <button className="h-9 w-9 rounded-lg text-lg font-bold ring-1 ring-slate-300" onClick={() => patch.mutate({ id: i.id, quantity: i.quantity + 1 })} aria-label="More">+</button>
            </div>
          </li>
        ))}
      </ul>

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <button className="kd-btn-ghost text-sm" onClick={() => clear.mutate(true)}>Remove bought</button>
          <button className="kd-btn-ghost text-sm text-red-700" onClick={() => { if (confirm('Clear the whole list?')) clear.mutate(false); }}><Icon name="trash" className="h-4 w-4" />Clear all</button>
        </div>
      )}
    </div>
  );
}
