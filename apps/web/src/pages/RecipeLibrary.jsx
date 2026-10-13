import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IconPlus } from '@tabler/icons-react';
import { getRecipes } from '../api/client.js';
import { useSettings } from '../hooks/useSettings.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import { SkeletonGrid } from '../components/ui/Skeleton.jsx';
import RecipeLibraryHeader from '../components/recipes/RecipeLibraryHeader.jsx';
import RecipeGrid from '../components/recipes/RecipeGrid.jsx';
import RecipeDetailModal from '../components/recipes/RecipeDetailModal.jsx';
import RecipeForm from '../components/recipes/RecipeForm.jsx';
import AISuggestPanel from '../components/recipes/AISuggestPanel.jsx';
import ExternalRecipeSearch from '../components/recipes/ExternalRecipeSearch.jsx';
import MealDbSearch from '../components/recipes/MealDbSearch.jsx';

const MEAL_TYPE_FILTERS = new Set(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);

function applyFilters(recipes, search, activeFilters) {
  let list = recipes;

  const lowerSearch = search.toLowerCase();
  if (lowerSearch) {
    list = list.filter((r) => r.name.toLowerCase().includes(lowerSearch));
  }

  for (const f of activeFilters) {
    if (f === 'all') continue;
    if (MEAL_TYPE_FILTERS.has(f)) {
      list = list.filter((r) => r.mealType === f);
    } else if (f === 'kid') {
      list = list.filter((r) => r.isKidFriendly);
    } else if (f === 'highProtein') {
      list = list.filter((r) => (r.proteinG ?? 0) >= 25);
    } else if (f === 'budget') {
      list = list.filter((r) => r.costPerServing != null && r.costPerServing <= 2.5);
    } else if (f === 'quick') {
      list = list.filter((r) => r.prepTimeMinutes != null && r.prepTimeMinutes < 15);
    }
  }

  return list;
}

function MyLibraryTab({ recipes, isLoading }) {
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState(['all']);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const toggleFilter = (key) => {
    if (key === 'all') {
      setActiveFilters(['all']);
      return;
    }
    setActiveFilters((prev) => {
      const withoutAll = prev.filter((f) => f !== 'all');
      if (withoutAll.includes(key)) {
        const next = withoutAll.filter((f) => f !== key);
        return next.length ? next : ['all'];
      }
      return [...withoutAll, key];
    });
  };

  const handleSelect = (recipe) => {
    setSelectedRecipe(recipe);
    setDetailOpen(true);
  };

  const filtered = isLoading ? [] : applyFilters(recipes ?? [], search, activeFilters);

  return (
    <div className="space-y-5">
      <AISuggestPanel />

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <RecipeLibraryHeader
            search={search}
            onSearch={setSearch}
            activeFilters={activeFilters}
            onToggleFilter={toggleFilter}
          />
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shrink-0"
        >
          <IconPlus size={16} />
          <span className="hidden sm:inline">New recipe</span>
        </button>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <RecipeGrid recipes={filtered} onSelect={handleSelect} />
      )}

      <RecipeDetailModal
        recipe={selectedRecipe}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <RecipeForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}

const TABS = ['My library', 'Find recipes'];

const SOURCES = [
  { id: 'mealdb', label: 'TheMealDB (free)' },
  { id: 'spoonacular', label: 'Spoonacular' },
];

function FindRecipesTab({ spoonacularConfigured }) {
  const [source, setSource] = useState('mealdb');
  const active = spoonacularConfigured ? source : 'mealdb';

  return (
    <div className="space-y-4">
      {spoonacularConfigured && (
        <div className="inline-flex p-0.5 bg-neutral-100 rounded-lg">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                active === s.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {active === 'mealdb' ? <MealDbSearch /> : <ExternalRecipeSearch />}
    </div>
  );
}

export default function RecipeLibrary() {
  useEffect(() => { document.title = 'NutriLabs — Recipe Library'; }, []);
  const [activeTab, setActiveTab] = useState(0);
  const { settings } = useSettings();

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes(),
    staleTime: 2 * 60 * 1000,
  });

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex gap-1 border-b border-neutral-100">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-4 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === i
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <MyLibraryTab recipes={recipes} isLoading={isLoading} />
        )}

        {activeTab === 1 && (
          <FindRecipesTab spoonacularConfigured={!!settings?.spoonacularConfigured} />
        )}
      </div>
    </ErrorBoundary>
  );
}
