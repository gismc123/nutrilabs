import { NavLink, Outlet } from 'react-router-dom';
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx';

// Kroger Deals: sale prices and digital coupons at the user's Kroger store.
const TABS = [
  { to: '/deals', label: 'Find deals', end: true },
  { to: '/deals/aisle', label: 'Aisle check' },
  { to: '/deals/coupons', label: 'Coupons' },
  { to: '/deals/list', label: 'Deal list' },
  { to: '/deals/store', label: 'Store' },
];

export default function DealsHome() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Kroger Deals</h1>
        <p className="text-sm text-neutral-500">Sale prices and digital coupons at your Kroger, matched to what you buy.</p>
      </div>
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Deals sections">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
                isActive ? 'bg-primary-600 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-300'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}
