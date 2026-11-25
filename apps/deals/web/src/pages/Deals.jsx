import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, money, shortDate } from '../api.js';
import { DealCard, Empty, ErrorBox, Freshness, Icon, Skeleton, ClipBadge } from '../components/ui.jsx';

const SAVED = 'kd-search';
const load = () => {
  try { return JSON.parse(localStorage.getItem(SAVED)) || {}; } catch { return {}; }
};

const GROUPS = [['all', 'All'], ['produce', 'Produce'], ['protein', 'Protein'], ['dairy', 'Dairy'], ['pantry', 'Pantry'], ['frozen', 'Frozen'], ['bakery', 'Bakery'], ['drinks', 'Drinks']];

function toListItem(x, quantity) {
  return {
    name: x.name,
    upc: x.upc,
    couponId: x.coupon?.id ?? null,
    quantity: quantity ?? x.quantity ?? x.buyQuantity ?? 1,
    unitPrice: x.each ?? x.effectiveEach,
    regular: x.regular ?? null,
    needsClip: !!x.coupon?.needsClip,
    note: x.coupon ? `Coupon: ${x.coupon.description}` : x.onSale ? `Sale${x.promoEnds ? ` until ${shortDate(x.promoEnds)}` : ''}` : null,
  };
}

export default function Deals() {
  const qc = useQueryClient();
  const saved = useMemo(load, []);
  const [budget, setBudget] = useState(saved.budget ?? '');
  const [people, setPeople] = useState(saved.people ?? '');
  const [ingredients, setIngredients] = useState(saved.ingredients ?? []);
  const [draft, setDraft] = useState('');
  const [inputs, setInputs] = useState(saved);
  const [tab, setTab] = useState(null);
  const [group, setGroup] = useState('all');
  const [toast, setToast] = useState('');

  const search = useQuery({
    queryKey: ['search', inputs],
    queryFn: () => api('/deals/search', {
      method: 'POST',
      body: {
        budget: inputs.budget ? Number(inputs.budget) : null,
        people: inputs.people ? Number(inputs.people) : null,
        ingredients: inputs.ingredients ?? [],
      },
    }),
  });

  const addToList = useMutation({
    mutationFn: (items) => api('/list', { method: 'POST', body: items }),
    onSuccess: (_d, items) => {
      qc.invalidateQueries({ queryKey: ['list'] });
      setToast(`Added ${items.length} item${items.length === 1 ? '' : 's'} to your list`);
      setTimeout(() => setToast(''), 2500);
    },
    onError: (e) => setToast(e.message),
  });

  const importList = useMutation({
    mutationFn: () => api('/nutrilabs/items'),
    onSuccess: (items) => {
      const names = items.map((i) => i.name).filter((n) => n.length >= 2);
      setIngredients((cur) => [...new Set([...cur, ...names])].slice(0, 25));
      setToast(names.length ? `Added ${Math.min(names.length, 25)} items from NutriLabs` : 'Your NutriLabs list is empty this week');
      setTimeout(() => setToast(''), 2500);
    },
    onError: (e) => setToast(e.message),
  });

  function addIngredient() {
    const parts = draft.split(',').map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length) setIngredients((cur) => [...new Set([...cur, ...parts])].slice(0, 25));
    setDraft('');
  }

  function submit(e) {
    e.preventDefault();
    const extra = draft.split(',').map((s) => s.trim()).filter((s) => s.length >= 2);
    const ing = [...new Set([...ingredients, ...extra])].slice(0, 25);
    setIngredients(ing);
    setDraft('');
    const next = { budget, people, ingredients: ing };
    localStorage.setItem(SAVED, JSON.stringify(next));
    setInputs(next);
    setTab(null);
  }

  function clearAll() {
    setBudget(''); setPeople(''); setIngredients([]); setDraft('');
    localStorage.removeItem(SAVED);
    setInputs({});
    setTab(null);
  }

  const data = search.data;
  const tabsAvail = [
    data?.bundles?.length ? ['bundles', `Bundles (${data.bundles.length})`] : null,
    data?.wanted?.length ? ['wanted', `Your items (${data.wanted.length})`] : null,
    ['deals', `All deals${data ? ` (${data.totalDeals})` : ''}`],
  ].filter(Boolean);
  const active = tab && tabsAvail.some((t) => t[0] === tab) ? tab : tabsAvail[0][0];

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card space-y-3 p-4">
        <p className="text-sm text-slate-600">Every field is optional. Use any of them.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="budget">Budget</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input id="budget" className="input pl-7" inputMode="decimal" placeholder="80" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="people">People</label>
            <input id="people" className="input" inputMode="numeric" placeholder="2" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ing">Items you want</label>
          <div className="flex gap-2">
            <input id="ing" className="input" placeholder="chicken, rice, milk" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); addIngredient(); } }} />
            <button type="button" className="btn-ghost shrink-0 px-3" onClick={addIngredient} aria-label="Add item"><Icon name="plus" /></button>
          </div>
          {ingredients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ingredients.map((i) => (
                <button type="button" key={i} onClick={() => setIngredients((cur) => cur.filter((x) => x !== i))} className="chip min-h-8 bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  {i} <Icon name="x" className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
          <button type="button" className="mt-2 text-sm font-semibold text-brand-700 disabled:opacity-50" disabled={importList.isPending} onClick={() => importList.mutate()}>
            {importList.isPending ? 'Importing...' : '+ Import this week\'s NutriLabs grocery list'}
          </button>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={search.isFetching}>{search.isFetching ? 'Finding deals...' : 'Find deals'}</button>
          <button type="button" className="btn-ghost" onClick={clearAll}>Clear</button>
        </div>
      </form>

      {data && <Freshness freshness={data.freshness} />}
      {data?.store && <p className="-mt-2 text-xs text-slate-500">Prices at {data.store.name}.</p>}

      {search.isLoading && <Skeleton rows={4} />}
      {search.error && (
        search.error.code === 'NO_STORE'
          ? <Empty title="Pick your store first" action={<Link to="/settings" className="btn-primary">Open Settings</Link>}>Prices depend on the store, so choose your Kroger in Settings.</Empty>
          : <ErrorBox error={search.error} onRetry={() => search.refetch()} />
      )}

      {data && (
        <>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {tabsAvail.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${active === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{label}</button>
            ))}
          </div>

          {active === 'bundles' && <Bundles bundles={data.bundles} onAdd={(b) => addToList.mutate(b.items.map((l) => toListItem(l, l.quantity)))} />}
          {active === 'wanted' && <Wanted wanted={data.wanted} related={data.relatedDeals} onAdd={(x) => addToList.mutate([toListItem(x)])} />}
          {active === 'deals' && (
            <DealList deals={data.deals.concat(data.relatedDeals)} possible={data.possibleCoupons} group={group} setGroup={setGroup} onAdd={(x) => addToList.mutate([toListItem(x)])} />
          )}
        </>
      )}

      {toast && <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function AddButton({ onClick, label = 'Add to list' }) {
  return <button className="btn-ghost min-h-10 w-full text-sm" onClick={onClick}><Icon name="plus" className="h-4 w-4" />{label}</button>;
}

function DealList({ deals, possible, group, setGroup, onAdd }) {
  const shown = deals.filter((d) => group === 'all' || d.group === group).sort((a, b) => b.savingsEach * b.buyQuantity - a.savingsEach * a.buyQuantity);
  return (
    <div className="space-y-3">
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {GROUPS.map(([k, label]) => (
          <button key={k} onClick={() => setGroup(k)} className={`chip min-h-9 shrink-0 px-3 text-sm ${group === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{label}</button>
        ))}
      </div>
      {shown.length === 0 && <Empty title="No deals here yet">Deals appear after the nightly price and coupon syncs. You can start a price sync in Settings.</Empty>}
      {shown.map((d) => <DealCard key={d.upc} item={d} action={<AddButton onClick={() => onAdd(d)} />} />)}
      {group === 'all' && possible?.length > 0 && (
        <details className="card p-3">
          <summary className="min-h-10 cursor-pointer py-2 font-semibold">Coupons that might apply ({possible.length})</summary>
          <p className="mb-2 text-xs text-slate-600">These products share a brand with a coupon, but the match is not certain, so the savings are not counted.</p>
          <div className="space-y-2">{possible.map((d) => <DealCard key={d.upc} item={d} compact />)}</div>
        </details>
      )}
    </div>
  );
}

function Wanted({ wanted, related, onAdd }) {
  return (
    <div className="space-y-4">
      {wanted.map((w) => (
        <section key={w.ingredient} className="space-y-2">
          <h3 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-500">{w.ingredient}{w.query && w.query !== w.ingredient.toLowerCase() ? <span className="font-normal normal-case"> (searched "{w.query}")</span> : null}</h3>
          {w.status !== 'found' && (
            <div className="card p-3 text-sm text-slate-600">{w.status === 'limited' ? 'The Kroger API daily limit was reached. Try again tomorrow.' : 'Nothing found at your store. Try a simpler word, like "garlic" instead of "garlic cloves".'}</div>
          )}
          {w.best && <DealCard item={w.best} action={<AddButton onClick={() => onAdd(w.best)} label="Add best pick to list" />} />}
          {w.options?.length > 0 && (
            <details className="px-1">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-brand-700">Other options ({w.options.length})</summary>
              <div className="space-y-2">{w.options.map((o) => <DealCard key={o.upc} item={o} action={<AddButton onClick={() => onAdd(o)} />} />)}</div>
            </details>
          )}
        </section>
      ))}
      {related?.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-500">Other deals on these items</h3>
          {related.slice(0, 10).map((d) => <DealCard key={d.upc} item={d} action={<AddButton onClick={() => onAdd(d)} />} />)}
        </section>
      )}
    </div>
  );
}

function Bundles({ bundles, onAdd }) {
  return (
    <div className="space-y-4">
      {bundles.map((b) => (
        <section key={b.key} className="card overflow-hidden">
          <div className="bg-slate-900 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{b.name}</h3>
                <p className="text-sm text-slate-300">{b.description}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{money(b.total)}</p>
                {b.savings > 0 && <p className="text-sm font-semibold text-emerald-300">Save {money(b.savings)}</p>}
              </div>
            </div>
            {b.budget != null && (
              <p className={`mt-2 text-sm ${b.overBudget ? 'font-semibold text-red-300' : 'text-slate-300'}`}>
                {b.overBudget ? `Over budget by ${money(-b.budgetLeft)} because of the items you asked for.` : `${money(b.budgetLeft)} left of ${money(b.budget)}`}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">{b.items.length} items · {b.byGroup.map((g) => `${g.label} ${money(g.subtotal)}`).join(' · ')}</p>
          </div>
          {b.clipList.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-amber-900"><Icon name="scissors" className="h-4 w-4" />Clip these {b.clipList.length} coupons in the Kroger app before checkout</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
                {b.clipList.map((c) => <li key={c.couponId + c.forItem}>{c.description}{c.pickupDeliveryOnly ? ' (pickup or delivery only)' : ''}</li>)}
              </ul>
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {b.items.map((l) => (
              <li key={l.upc} className="flex gap-3 p-3">
                {l.imageUrl ? <img src={l.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-contain" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{l.name}</p>
                  <p className="text-xs text-slate-500">
                    {l.quantity}{l.perLb ? ' lb' : ''} x {money(l.each)}{l.perLb ? '/lb' : ''}{l.savings > 0 ? <span className="text-slate-400 line-through"> {money(l.regular)}</span> : null}
                    {l.wantedFor ? <span className="font-semibold text-brand-700"> · for "{l.wantedFor}"</span> : null}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.onSale && <span className="chip bg-red-100 text-red-800">Sale{l.promoEnds ? ` until ${shortDate(l.promoEnds)}` : ''}</span>}
                    <ClipBadge coupon={l.coupon} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold">{money(l.lineTotal)}</p>
                  {l.savings > 0 && <p className="text-xs font-semibold text-emerald-700">-{money(l.savings)}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="p-3"><button className="btn-primary w-full" onClick={() => onAdd(b)}>Add all {b.items.length} to my list</button></div>
        </section>
      ))}
      <p className="px-1 text-xs text-slate-500">Bundles use sale prices and coupons matched with high confidence. Final prices are estimates and can change at the register.</p>
    </div>
  );
}
