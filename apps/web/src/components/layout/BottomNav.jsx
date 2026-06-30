import { NavLink, useLocation } from 'react-router-dom';
import {
  IconHome,
  IconCalendar,
  IconBook,
  IconShoppingCart,
  IconWallet,
  IconBarcode,
} from '@tabler/icons-react';

const TABS = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/plan', label: 'Plan', icon: IconCalendar },
  { to: '/recipes', label: 'Recipes', icon: IconBook },
  { to: '/shop', label: 'Shop', icon: IconShoppingCart },
  { to: '/budget', label: 'Budget', icon: IconWallet },
  { to: '/pantry', label: 'Pantry', icon: IconBarcode },
];

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 flex z-40">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors ${
              isActive ? 'text-primary-600' : 'text-neutral-400'
            }`
          }
        >
          <Icon size={22} stroke={1.5} />
          <span className="mt-0.5">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
