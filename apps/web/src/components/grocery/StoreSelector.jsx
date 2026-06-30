import { centsToDisplay } from '../../utils/currency.js';

const STORES = ['Walmart', 'Kroger', 'Aldi'];

function storeKey(store) {
  const map = { Walmart: 'estimatedPriceWalmart', Kroger: 'estimatedPriceKroger', Aldi: 'estimatedPriceAldi' };
  return map[store];
}

function basketTotal(items, store) {
  const key = storeKey(store);
  return items.reduce((sum, item) => sum + (item[key] ?? 0), 0);
}

export default function StoreSelector({ items, activeStore, onStoreChange }) {
  const totals = {};
  let hasAnyData = false;
  for (const store of STORES) {
    const total = basketTotal(items, store);
    totals[store] = total;
    if (total > 0) hasAnyData = true;
  }

  const cheapest = hasAnyData
    ? STORES.reduce((best, s) => (totals[s] > 0 && (!best || totals[s] < totals[best]) ? s : best), null)
    : null;

  return (
    <div className="flex gap-1 bg-neutral-100 rounded-xl p-1">
      {STORES.map((store) => {
        const isActive = activeStore === store;
        const total = totals[store];
        return (
          <button
            key={store}
            onClick={() => onStoreChange(store)}
            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-xs font-medium transition-colors relative ${
              isActive
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <span>{store}</span>
            <span className={`mt-0.5 font-semibold ${isActive ? 'text-primary-600' : 'text-neutral-400'}`}>
              {total > 0 ? centsToDisplay(total) : '—'}
            </span>
            {cheapest === store && total > 0 && (
              <span className="absolute -top-1 right-0 bg-primary-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">
                Best
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
