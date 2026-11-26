import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSearch, IconArrowsShuffle, IconSparkles, IconLoader2, IconRefresh, IconPlus, IconLink } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import Badge from '../ui/Badge.jsx';
import RecipeImage from '../recipes/RecipeImage.jsx';
import ImportRecipeModal from '../recipes/ImportRecipeModal.jsx';
import {
  getRecipes, updateMealPlanMeals, aiSuggestSlot, aiExpandIdea,
  getMealDbFilters, searchMealDb, randomMealDb, importMealDbRecipe,
  searchExternalRecipes, importRecipe,
} from '../../api/client.js';
import { useHealth } from '../../hooks/useHealth.js';
import { useSettings } from '../../hooks/useSettings.js';
import { centsToDisplay } from '../../utils/currency.js';

const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };
const SOURCE_LABELS = { AI: 'AI', THEMEALDB: 'TheMealDB', SPOONACULAR: 'Spoonacular', WEB: 'Web' };

// TheMealDB categories that suit each slot (its "Breakfast" category is small but real).
const MEALDB_CATEGORIES = {
  BREAKFAST: ['Breakfast', 'Vegetarian', 'Side'],
  LUNCH: ['Chicken', 'Beef', 'Pasta', 'Pork', 'Seafood', 'Vegetarian', 'Starter'],
  DINNER: ['Chicken', 'Beef', 'Pasta', 'Pork', 'Seafood', 'Vegetarian', 'Lamb'],
  SNACK: ['Starter', 'Side', 'Dessert'],
};
const SPOONACULAR_TYPE = { BREAKFAST: 'breakfast', LUNCH: 'main course', DINNER: 'main course', SNACK: 'snack' };

const AI_MOODS = ['Quick (under 20 min)', 'Comfort food', 'Healthy & light', 'Kid favorite', 'Use what I have', 'Something new'];

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function useElapsed(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return secs;
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  );
}

function Thumb({ src, alt }) {
  return (
    <div className="w-12 h-12 shrink-0 rounded-lg bg-neutral-100 overflow-hidden">
      <RecipeImage src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}

// ── My recipes ────────────────────────────────────────────────────────────────

function MyRecipesTab({ mealType, onSelect, busy }) {
  const [search, setSearch] = useState('');
  const [allTypes, setAllTypes] = useState(false);
  const [kidOnly, setKidOnly] = useState(false);
  const [quickOnly, setQuickOnly] = useState(false);

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes', allTypes ? {} : { mealType }],
    queryFn: () => getRecipes(allTypes ? {} : { mealType }),
  });

  const q = search.trim().toLowerCase();
  const filtered = recipes.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.tags?.some((t) => t.includes(q)))
    && (!kidOnly || r.isKidFriendly)
    && (!quickOnly || (r.prepTimeMinutes != null && r.prepTimeMinutes <= 30)));

  return (
    <div className="space-y-3">
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your recipes..."
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip active={allTypes} onClick={() => setAllTypes((v) => !v)}>All meal types</Chip>
        <Chip active={kidOnly} onClick={() => setKidOnly((v) => !v)}>Kid-friendly</Chip>
        <Chip active={quickOnly} onClick={() => setQuickOnly((v) => !v)}>30 min or less</Chip>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} height="3rem" />)}</div>
      ) : (
        <div className="space-y-1 max-h-[45vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">
              No recipes match. Try <strong>Discover</strong> or <strong>Ask AI</strong> to find new ones.
            </p>
          ) : filtered.map((r) => (
            <button
              key={r.id} onClick={() => onSelect(r)} disabled={busy}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-100 transition-colors flex items-center gap-3 disabled:opacity-50"
            >
              <Thumb src={r.imageUrl} alt={r.name} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">{r.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-neutral-400">
                  {r.calories != null && <span>{r.calories} cal</span>}
                  {r.proteinG != null && <span>P {r.proteinG}g</span>}
                  {r.costPerServing != null && <span>{centsToDisplay(Math.round(r.costPerServing * 100))}/srv</span>}
                  {r.prepTimeMinutes != null && <span>{r.prepTimeMinutes} min</span>}
                  {r.isKidFriendly && <span className="text-primary-600">✓ Kid</span>}
                  {SOURCE_LABELS[r.source] && <span>· {SOURCE_LABELS[r.source]}</span>}
                </div>
              </div>
              {allTypes && <Badge label={MEAL_LABELS[r.mealType]} variant="default" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Discover (TheMealDB / Spoonacular) ───────────────────────────────────────

function DiscoverTab({ mealType, onAssign, busy }) {
  const { settings } = useSettings();
  const spoonacularOn = !!settings?.spoonacularConfigured;
  const [source, setSource] = useState('mealdb');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [shuffle, setShuffle] = useState(0);
  const debounced = useDebounced(query.trim(), 400);
  const queryClient = useQueryClient();

  const { data: filters } = useQuery({ queryKey: ['mealdb-filters'], queryFn: getMealDbFilters, staleTime: Infinity });

  const searching = debounced.length >= 2;
  const mealDbQuery = useQuery({
    queryKey: ['picker-mealdb', searching ? debounced : null, category, country, searching ? 0 : shuffle, mealType],
    queryFn: () => (searching
      ? searchMealDb({ query: debounced, category: category || undefined, country: country || undefined })
      // Nothing typed: a random sample that suits this slot.
      : randomMealDb({
        category: category || (country ? undefined : (mealType === 'BREAKFAST' ? 'Breakfast' : undefined)),
        country: country || undefined,
      })),
    enabled: source === 'mealdb',
    staleTime: searching ? 5 * 60 * 1000 : Infinity,
  });

  const spoonQuery = useQuery({
    queryKey: ['picker-spoon', debounced, mealType],
    queryFn: () => searchExternalRecipes({ query: debounced, type: SPOONACULAR_TYPE[mealType] }),
    enabled: source === 'spoonacular' && searching,
    staleTime: 10 * 60 * 1000,
  });

  const addMutation = useMutation({
    mutationFn: async (item) => {
      const imported = source === 'mealdb'
        ? await importMealDbRecipe(item.id, { mealType })
        : await importRecipe(item.id);
      await onAssign(imported.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['picker-mealdb'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const active = source === 'mealdb' ? mealDbQuery : spoonQuery;
  const results = active.data?.results ?? [];
  const selectClass = 'px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-600';

  return (
    <div className="space-y-3">
      {spoonacularOn && (
        <div className="flex gap-2 text-xs">
          <Chip active={source === 'mealdb'} onClick={() => setSource('mealdb')}>TheMealDB (free)</Chip>
          <Chip active={source === 'spoonacular'} onClick={() => setSource('spoonacular')}>Spoonacular (with macros &amp; price)</Chip>
        </div>
      )}

      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={source === 'mealdb' ? 'Dish or main ingredient (tacos, chicken, pasta...)' : 'Search Spoonacular (e.g. chicken burrito bowl)'}
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>

      {source === 'mealdb' && (
        <>
          <div className="flex flex-wrap gap-2">
            {MEALDB_CATEGORIES[mealType ?? 'DINNER'].map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory((v) => (v === c ? '' : c))}>{c}</Chip>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass}>
              <option value="">Any cuisine</option>
              {filters?.countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {!searching && (
              <button
                onClick={() => setShuffle((n) => n + 1)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50"
              >
                <IconArrowsShuffle size={13} /> Surprise me
              </button>
            )}
          </div>
        </>
      )}

      {source === 'spoonacular' && !searching && (
        <p className="text-sm text-neutral-400 text-center py-6">Type at least 2 letters to search Spoonacular.</p>
      )}

      {active.isFetching ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} height="3.5rem" />)}</div>
      ) : active.error ? (
        <p className="text-sm text-danger-600 text-center py-6">{active.error.message}</p>
      ) : (source === 'mealdb' || searching) && results.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-6">No recipes found — try another word or category.</p>
      ) : (
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-50">
              <Thumb src={r.image} alt={r.title} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate" title={r.title}>{r.title}</p>
                <p className="text-xs text-neutral-400 truncate">
                  {source === 'mealdb'
                    ? [r.category, r.cuisine].filter(Boolean).join(' · ')
                    : [r.readyInMinutes && `${r.readyInMinutes} min`, r.calories && `${Math.round(r.calories)} cal`,
                      r.pricePerServing && `$${(r.pricePerServing / 100).toFixed(2)}/srv`].filter(Boolean).join(' · ')}
                  {r.libraryRecipeId ? ' · in your library' : ''}
                </p>
              </div>
              <button
                onClick={() => addMutation.mutate(r)}
                disabled={busy || addMutation.isPending}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 shrink-0"
              >
                {addMutation.isPending && addMutation.variables?.id === r.id
                  ? <IconLoader2 size={13} className="animate-spin" />
                  : <IconPlus size={13} />}
                Add
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-400">Adding saves the recipe to your library (with its ingredients for the grocery list) and puts it in this slot.</p>
    </div>
  );
}

// ── Ask AI ────────────────────────────────────────────────────────────────────

function AISuggestTab({ mealPlanId, dayOfWeek, mealType, onClose }) {
  const { health } = useHealth();
  const queryClient = useQueryClient();
  const [request, setRequest] = useState('');
  const [ideas, setIdeas] = useState(null);
  const [seen, setSeen] = useState([]);

  const ideasMutation = useMutation({
    mutationFn: ({ text, exclude }) => aiSuggestSlot(mealPlanId, { dayOfWeek, mealType, request: text || undefined, exclude }),
    onSuccess: (result) => {
      setIdeas(result);
      setSeen((prev) => [...new Set([...prev, ...result.map((r) => r.name)])].slice(-40));
    },
  });

  const expandMutation = useMutation({
    mutationFn: ({ idea, assign }) => aiExpandIdea(mealPlanId, { dayOfWeek, mealType, idea, assign }),
    onSuccess: (_, { assign }) => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success(assign ? 'Recipe written and added to your plan' : 'Recipe saved to your library');
      if (assign) onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const thinking = ideasMutation.isPending || expandMutation.isPending;
  const elapsed = useElapsed(thinking);

  if (health && !health.ollamaConnected) {
    return (
      <p className="text-sm text-neutral-500 text-center py-6">
        AI suggestions unavailable — check the Ollama connection in Settings
      </p>
    );
  }

  const ask = (text, exclude = []) => ideasMutation.mutate({ text, exclude });

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); ask(request.trim()); }}
        className="flex gap-2"
      >
        <input
          type="text" value={request} onChange={(e) => setRequest(e.target.value)} maxLength={300}
          placeholder={`What sounds good? (e.g. "chicken, Mexican, 30 min")`}
          className="flex-1 min-w-0 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
        <button
          type="submit" disabled={thinking}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 shrink-0"
        >
          <IconSparkles size={15} /> Ideas
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {AI_MOODS.map((m) => (
          <Chip key={m} active={false} onClick={() => { setRequest(m); ask(m); }}>{m}</Chip>
        ))}
      </div>

      {thinking && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">
          <IconLoader2 size={14} className="animate-spin text-primary-600" />
          {expandMutation.isPending
            ? `Writing the full recipe for ${expandMutation.variables.idea.name}… ${elapsed}s (usually 10–30s)`
            : `Thinking up ideas… ${elapsed}s (usually 5–20s)`}
        </div>
      )}

      {ideasMutation.error && !thinking && (
        <div className="text-sm text-danger-600 text-center py-2 space-y-2">
          <p>{ideasMutation.error.message}</p>
          <button onClick={() => ask(request.trim())} className="text-xs font-medium text-primary-600 underline">Try again</button>
        </div>
      )}

      {!ideas && !thinking && !ideasMutation.error && (
        <p className="text-xs text-neutral-400 text-center py-4">
          Ideas use your household, food preferences (Settings → Preferences) and what's already planned this week.
        </p>
      )}

      {ideas && (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {ideas.length === 0 && <p className="text-sm text-neutral-400 text-center py-4">No ideas came back — try again.</p>}
          {ideas.map((s) => (
            <div key={s.name} className="border border-neutral-100 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900">{s.name}</p>
                {s.cuisine && <span className="text-xs text-neutral-400 shrink-0">{s.cuisine}</span>}
              </div>
              {s.description && <p className="text-xs text-neutral-500">{s.description}</p>}
              <div className="flex gap-1.5 flex-wrap text-xs text-neutral-600">
                {s.prepTimeMinutes && <span className="bg-neutral-100 px-2 py-0.5 rounded-full">{s.prepTimeMinutes} min</span>}
                {s.estimatedCalories && <span className="bg-neutral-100 px-2 py-0.5 rounded-full">{s.estimatedCalories} cal</span>}
                {s.estimatedProteinG && <span className="bg-neutral-100 px-2 py-0.5 rounded-full">P {s.estimatedProteinG}g</span>}
                {s.estimatedCostPerServing && <span className="bg-neutral-100 px-2 py-0.5 rounded-full">~${s.estimatedCostPerServing.toFixed(2)}/srv</span>}
                {s.isKidFriendly && <span className="text-primary-600 px-1">✓ Kid</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => expandMutation.mutate({ idea: s, assign: true })} disabled={thinking}
                  className="flex-1 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Add to plan
                </button>
                <button
                  onClick={() => expandMutation.mutate({ idea: s, assign: false })} disabled={thinking}
                  className="flex-1 py-1.5 text-xs font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50"
                >
                  Save for later
                </button>
              </div>
            </div>
          ))}
          {ideas.length > 0 && (
            <button
              onClick={() => ask(request.trim(), seen)} disabled={thinking}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 disabled:opacity-50"
            >
              <IconRefresh size={13} /> Show me different ideas
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ['My recipes', 'Discover', 'Ask AI'];

export default function MealPickerSheet({ isOpen, onClose, mealPlanId, dayOfWeek, mealType }) {
  const [activeTab, setActiveTab] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const assignMutation = useMutation({
    mutationFn: (recipeId) => updateMealPlanMeals(mealPlanId, { dayOfWeek, mealType, recipeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
      toast.success('Recipe added to plan');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
    <BottomSheet wide isOpen={isOpen && !importOpen} onClose={onClose} title={`Pick a ${mealType?.toLowerCase() ?? 'meal'}`}>
      <div className="space-y-4">
        <div className="flex border-b border-neutral-100">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === i ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          onClick={() => setImportOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary-600 border border-dashed border-primary-300 rounded-lg hover:bg-primary-50"
        >
          <IconLink size={14} /> Found a recipe online? Import it from a link
        </button>

        {activeTab === 0 && (
          <MyRecipesTab mealType={mealType} busy={assignMutation.isPending} onSelect={(r) => assignMutation.mutate(r.id)} />
        )}
        {activeTab === 1 && (
          <DiscoverTab mealType={mealType} busy={assignMutation.isPending} onAssign={(id) => assignMutation.mutateAsync(id)} />
        )}
        {activeTab === 2 && (
          <AISuggestTab mealPlanId={mealPlanId} dayOfWeek={dayOfWeek} mealType={mealType} onClose={onClose} />
        )}
      </div>
    </BottomSheet>
    <ImportRecipeModal
      isOpen={isOpen && importOpen}
      planTarget={{ mealPlanId, dayOfWeek, mealType }}
      onClose={() => { setImportOpen(false); onClose(); }}
    />
    </>
  );
}
