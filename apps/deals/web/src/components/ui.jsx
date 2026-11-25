import { ago, money, shortDate } from '../api.js';

// Small inline icons (no icon library to keep the bundle light).
const paths = {
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm5-5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  search: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.2 4.2 1.4-1.4-4.2-4.2A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z',
  ticket: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7Zm7 0v10',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.3 7.3 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm2.1-13.1L20 20M8.1 16.1 20 4',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4m-4 5a8 8 0 0 0 14.9 3.9M20 20v-4h-4',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
};

export function Icon({ name, className = 'h-5 w-5', filled = false }) {
  const d = paths[name];
  const stroke = !filled && !['tag'].includes(name);
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex gap-3 p-3">
          <div className="skeleton h-16 w-16 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-6 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="card px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Icon name="tag" className="h-6 w-6" />
      </div>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="card flex items-start gap-3 border-l-4 border-red-500 p-4 text-sm">
      <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      <div className="flex-1">
        <p className="font-medium text-red-800">{error.message}</p>
        {onRetry && <button className="mt-2 font-semibold text-brand-700" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

// Last-synced times and any sync problems. Shown on every data screen.
export function Freshness({ freshness, compact = false }) {
  if (!freshness) return null;
  return (
    <div className="space-y-2">
      {freshness.alerts?.map((a, i) => (
        <div key={i} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${a.kind === 'session' ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-red-50 text-red-900 ring-1 ring-red-200'}`}>
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{a.message}</span>
        </div>
      ))}
      {!compact && (
        <p className="text-xs text-slate-500">
          Prices synced {ago(freshness.pricesAt)} · Coupons synced {ago(freshness.couponsAt)}
          {freshness.priceSyncRunning && ' · price sync running now'}
        </p>
      )}
    </div>
  );
}

export function ClipBadge({ coupon }) {
  if (!coupon) return null;
  if (coupon.clipped) return <span className="chip bg-emerald-100 text-emerald-800"><Icon name="check" className="h-3 w-3" />Coupon clipped</span>;
  return <span className="chip bg-amber-100 text-amber-900"><Icon name="scissors" className="h-3 w-3" />Clip in Kroger app</span>;
}

// One priced product: shelf price, sale, coupon, and what you pay.
export function DealCard({ item, action, compact = false }) {
  const c = item.coupon;
  const pc = item.possibleCoupon;
  return (
    <div className="card p-3">
      <div className="flex gap-3">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Icon name="tag" /></div>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{[item.size, item.aisle].filter(Boolean).join(' · ')}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{money(item.effectiveEach)}{item.soldBy === 'WEIGHT' && <span className="text-base font-semibold text-slate-500">/lb</span>}</span>
            {item.savingsEach > 0 && <span className="text-sm text-slate-500 line-through">{money(item.regular)}</span>}
            {item.savingsEach > 0 && <span className="text-sm font-bold text-emerald-700">Save {money(item.savingsEach * (item.buyQuantity || 1))}{item.buyQuantity > 1 ? ` on ${item.buyQuantity}` : ''}</span>}
          </div>
          {item.buyQuantity > 1 && <p className="text-xs font-medium text-slate-700">each, when you buy {item.buyQuantity}</p>}
        </div>
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.onSale && <span className="chip bg-red-100 text-red-800">Sale {money(item.promo)}{item.promoEnds ? ` until ${shortDate(item.promoEnds)}` : ''}</span>}
          {c && <ClipBadge coupon={c} />}
          {c?.pickupDeliveryOnly && <span className="chip bg-slate-200 text-slate-700">Pickup or delivery only</span>}
          {item.unitPrice && <span className="chip bg-slate-100 text-slate-600">{item.unitPrice}</span>}
        </div>
      )}
      {c && !compact && <p className="mt-2 text-xs text-slate-600">Coupon: {c.description}{c.expiryDate ? ` (ends ${shortDate(c.expiryDate)})` : ''}{c.sizeNote ? `. ${c.sizeNote}` : ''}</p>}
      {pc && (
        <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
          <span className="font-semibold">Might also apply:</span> {pc.description}.{' '}
          {pc.sizeUncertain ? 'That deal price is probably for a smaller size than this one, so it is not counted.' : 'Not counted in the price because the match is not certain. Check the coupon terms.'}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
