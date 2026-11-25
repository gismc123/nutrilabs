import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Deals from './pages/Deals.jsx';
import Lookup from './pages/Lookup.jsx';
import Coupons from './pages/Coupons.jsx';
import ShoppingList from './pages/ShoppingList.jsx';
import Settings from './pages/Settings.jsx';

const tabs = [
  { to: '/', label: 'Deals', icon: 'tag', end: true },
  { to: '/lookup', label: 'Aisle', icon: 'search' },
  { to: '/coupons', label: 'Coupons', icon: 'ticket' },
  { to: '/list', label: 'List', icon: 'list' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

export default function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me'), retry: false, staleTime: Infinity });

  useEffect(() => {
    const onOut = () => qc.setQueryData(['me'], null);
    window.addEventListener('kd:signed-out', onOut);
    return () => window.removeEventListener('kd:signed-out', onOut);
  }, [qc]);

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
  }
  if (!me.data) return <Login onSignedIn={(u) => qc.setQueryData(['me'], u)} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-screen-sm flex-col">
      <header className="sticky top-0 z-20 bg-brand-700 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow">
        <p className="text-lg font-bold tracking-tight">KrogerDeals</p>
      </header>
      <main className="flex-1 px-3 pb-28 pt-3">
        <Routes>
          <Route path="/" element={<Deals />} />
          <Route path="/lookup" element={<Lookup />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/list" element={<ShoppingList />} />
          <Route path="/settings" element={<Settings user={me.data} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-screen-sm grid-cols-5">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-brand-700' : 'text-slate-500'}`}>
              <Icon name={t.icon} className="h-6 w-6" />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
