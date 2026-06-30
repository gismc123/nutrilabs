import { IconSearch } from '@tabler/icons-react';

const FILTER_CHIPS = [
  { label: 'All', key: 'all' },
  { label: 'Breakfast', key: 'BREAKFAST' },
  { label: 'Lunch', key: 'LUNCH' },
  { label: 'Dinner', key: 'DINNER' },
  { label: 'Kid-friendly', key: 'kid' },
  { label: 'High protein', key: 'highProtein' },
  { label: 'Budget', key: 'budget' },
  { label: 'Quick', key: 'quick' },
];

export default function RecipeLibraryHeader({ search, onSearch, activeFilters, onToggleFilter }) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search recipes..."
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        {FILTER_CHIPS.map((chip) => {
          const active = activeFilters.includes(chip.key);
          return (
            <button
              key={chip.key}
              onClick={() => onToggleFilter(chip.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
