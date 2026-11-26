import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconPlus, IconLink, IconRestore, IconSparkles, IconWorldSearch } from '@tabler/icons-react';
import { getRecipes, deleteRecipe, hideRecipe, unhideRecipe } from '../api/client.js';
import { useUiStore } from '../store/uiStore.js';
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
import ImportRecipeModal from '../components/recipes/ImportRecipeModal.jsx';

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

function RemovedRecipes() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: removed = [] } = useQuery({
    queryKey: ['recipes', { hidden: true }],
    queryFn: () => getRecipes({ hidden: 'true' }),
  });
  const restore = useMutation({
    mutationFn: (id) => unhideRecipe(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
    onError: (err) => toast.error(err.message),
  });
  if (!removed.length) return null;

  return (
    <div className="border-t border-neutral-100 pt-4">
      <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-neutral-500 hover:text-neutral-700">
        {open ? 'Hide' : 'Show'} removed starter recipes ({removed.length})
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-neutral-100 border border-neutral-100 rounded-xl">
          {removed.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-neutral-600 truncate">{r.name}</span>
              <button
                onClick={() => restore.mutate(r.id)}
                disabled={restore.isPending}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline shrink-0 disabled:opacity-50"
              >
                <IconRestore size={13} /> Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyLibraryTab({ recipes, isLoading, onFind }) {
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);

  const removeMutation = useMutation({
    mutationFn: (recipe) => (recipe.userId == null ? hideRecipe(recipe.id) : deleteRecipe(recipe.id)),
    onSuccess: (_, recipe) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
      toast.success(recipe.userId == null ? 'Removed from your library' : 'Recipe deleted');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRemove = (recipe) => {
    if (recipe.userId == null) {
      showConfirm(
        'Remove from your library?',
        `"${recipe.name}" is a shared starter recipe. It will be hidden from your library (you can restore it at the bottom of this page).`,
        () => removeMutation.mutate(recipe),
      );
    } else {
      showConfirm(
        'Delete recipe?',
        `"${recipe.name}" will be permanently deleted and removed from any meal plans it's in.`,
        () => removeMutation.mutate(recipe),
      );
    }
  };

  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState(['all']);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState(null);

  // The "Save to NutriLabs" bookmarklet opens /recipes#import=<json>.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#import=')) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    try {
      const raw = JSON.parse(decodeURIComponent(hash.slice('#import='.length)));
      const payload = {
        pageUrl: typeof raw.pageUrl === 'string' ? raw.pageUrl.slice(0, 2000) : undefined,
        jsonld: Array.isArray(raw.jsonld) ? raw.jsonld.filter((j) => typeof j === 'string').slice(0, 5) : undefined,
        text: typeof raw.text === 'string' && raw.text.length >= 20 ? raw.text.slice(0, 30000) : undefined,
      };
      if (payload.jsonld?.length || payload.text) {
        setImportPayload(payload);
        setImportOpen(true);
      }
    } catch {
      // A malformed link: ignore it.
    }
  }, []);

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
          onClick={() => { setImportPayload(null); setImportOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors shrink-0"
        >
          <IconLink size={16} />
          <span className="hidden sm:inline">Import from link</span>
        </button>
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
        <RecipeGrid
          recipes={filtered}
          onSelect={handleSelect}
          onDelete={handleRemove}
          empty={recipes.length === 0 ? (
            <div className="text-center py-14 px-6 space-y-4 border border-dashed border-neutral-200 rounded-2xl">
              <p className="text-base font-semibold text-neutral-800">Your library is empty — time to build it</p>
              <p className="text-sm text-neutral-500 max-w-md mx-auto">
                Add the recipes you actually make: import one from a website, search free recipe collections, ask AI for ideas, or type in a family favorite.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => { setImportPayload(null); setImportOpen(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700">
                  <IconLink size={16} /> Import from a link
                </button>
                <button onClick={onFind}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                  <IconWorldSearch size={16} /> Find recipes
                </button>
                <button onClick={() => setFormOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                  <IconPlus size={16} /> Type one in
                </button>
              </div>
              <p className="text-xs text-neutral-400 flex items-center justify-center gap-1"><IconSparkles size={13} /> Or use “Suggest recipes with AI” above.</p>
            </div>
          ) : undefined}
        />
      )}

      <RemovedRecipes />

      <RecipeDetailModal
        recipe={selectedRecipe}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <RecipeForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
      />

      <ImportRecipeModal
        isOpen={importOpen}
        initialPayload={importPayload}
        onClose={() => { setImportOpen(false); setImportPayload(null); }}
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
          <MyLibraryTab recipes={recipes} isLoading={isLoading} onFind={() => setActiveTab(1)} />
        )}

        {activeTab === 1 && (
          <FindRecipesTab spoonacularConfigured={!!settings?.spoonacularConfigured} />
        )}
      </div>
    </ErrorBoundary>
  );
}
