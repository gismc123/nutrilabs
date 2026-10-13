import { centsToDisplay } from '../../utils/currency.js';

// One tab per store the price service covers. Totals are for one of each
// matched product, so they compare baskets, not exact recipe quantities.
export default function StoreSelector({ retailers, activeStore, onStoreChange }) {
  if (!retailers.length) return null;
  const maxPriced = Math.max(...retailers.map((r) => r.pricedCount));
  const comparable = retailers.filter((r) => r.pricedCount > 0 && r.pricedCount === maxPriced);
  const best = comparable.length > 1
    ? comparable.reduce((a, b) => (b.totalCents < a.totalCents ? b : a)).id
    : null;

  return (
    <div className="flex gap-1 bg-neutral-100 rounded-xl p-1">
      {retailers.map((r) => {
        const isActive = activeStore === r.id;
        return (
          <button
            key={r.id}
            onClick={() => onStoreChange(r.id)}
            className={`flex-1 min-w-0 flex flex-col items-center py-2 px-1 rounded-lg text-xs font-medium transition-colors relative ${
              isActive ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <span className="truncate max-w-full">{r.label}</span>
            <span className={`mt-0.5 font-semibold ${isActive ? 'text-primary-600' : 'text-neutral-400'}`}>
              {r.pricedCount > 0 ? centsToDisplay(r.totalCents) : '—'}
            </span>
            <span className="text-[10px] text-neutral-400">{r.pricedCount}/{r.itemCount} items</span>
            {best === r.id && (
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
