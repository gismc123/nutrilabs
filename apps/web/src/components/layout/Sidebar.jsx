import { NavLink } from 'react-router-dom';
import {
  IconHome,
  IconCalendar,
  IconBook,
  IconShoppingCart,
  IconWallet,
  IconSettings,
  IconBarcode,
} from '@tabler/icons-react';
import { useHealth } from '../../hooks/useHealth.js';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/plan', label: 'Plan', icon: IconCalendar },
  { to: '/recipes', label: 'Recipes', icon: IconBook },
  { to: '/shop', label: 'Shop', icon: IconShoppingCart },
  { to: '/budget', label: 'Budget', icon: IconWallet },
  { to: '/pantry', label: 'Pantry', icon: IconBarcode },
];

function StatusDot({ connected }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        connected === true
          ? 'bg-primary-600'
          : connected === false
          ? 'bg-neutral-300'
          : 'bg-neutral-300'
      }`}
    />
  );
}

export default function Sidebar() {
  const { health } = useHealth();

  return (
    <aside className="hidden md:flex flex-col w-[220px] flex-shrink-0 border-r border-neutral-200 bg-white h-full">
      <div className="px-4 py-5 flex items-center gap-2.5">
        <img src="/logo.svg" alt="" className="w-9 h-9 rounded-xl shadow-sm" />
        <span className="text-xl font-bold text-primary-600 tracking-tight">NutriLabs</span>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`
            }
          >
            <Icon size={20} stroke={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-50 text-primary-600'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`
          }
        >
          <IconSettings size={20} stroke={1.5} />
          Settings
        </NavLink>
      </div>

      <div className="px-5 py-4 border-t border-neutral-100">
        <p className="text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">Services</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <StatusDot connected={health?.ollamaConnected} />
            Ollama
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <StatusDot connected={health?.spoonacularConnected} />
            Spoonacular
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <StatusDot connected={false} />
            Kroger
          </div>
        </div>
      </div>
    </aside>
  );
}
