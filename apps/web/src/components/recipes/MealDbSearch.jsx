import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSearch, IconBrandYoutube, IconExternalLink } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';
import Badge from '../ui/Badge.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { safeUrl } from '../../utils/safeUrl.js';
import { getMealDbFilters, searchMealDb, getMealDbRecipe, importMealDbRecipe } from '../../api/client.js';

const MEAL_TYPES = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
  { value: 'SNACK', label: 'Snack' },
];

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatQty(q) {
  return q == null ? '' : String(Math.round(Number(q) * 100) / 100);
}

function MealDbCard({ result, onView }) {
  return (
    <button
      onClick={() => onView(result)}
      className="w-full text-left bg-white border border-neutral-100 rounded-xl overflow-hidden hover:border-neutral-200 hover:shadow-sm transition-all"
    >
      {result.image && (
        <img src={result.image} alt={result.title} loading="lazy" className="w-full h-32 object-cover" />
      )}
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-neutral-900 line-clamp-2">{result.title}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {result.category && (
            <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-500">{result.category}</span>
          )}
          {result.cuisine && <span className="text-xs text-neutral-500">{result.cuisine}</span>}
          {result.libraryRecipeId && <Badge label="In library" variant="info" />}
        </div>
      </div>
    </button>
  );
}

function MealDbDetail({ mealDbId, onClose }) {
  const queryClient = useQueryClient();
  const [servings, setServings] = useState(4);
  const [mealType, setMealType] = useState('DINNER');
  const [isKidFriendly, setIsKidFriendly] = useState(true);

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['mealdb-recipe', mealDbId],
    queryFn: () => getMealDbRecipe(mealDbId),
    enabled: !!mealDbId,
    staleTime: 10 * 60 * 1000,
  });

  // Start the import options from TheMealDB's mapping each time a recipe opens.
  useEffect(() => {
    if (!detail) return;
    setServings(detail.recipe.servings);
    setMealType(detail.recipe.mealType);
    setIsKidFriendly(detail.recipe.isKidFriendly);
  }, [detail]);

  const importMutation = useMutation({
    mutationFn: () => importMealDbRecipe(mealDbId, { servings, mealType, isKidFriendly }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['mealdb-search'] });
      queryClient.invalidateQueries({ queryKey: ['mealdb-recipe', mealDbId] });
      toast.success(data.alreadyImported ? 'Already in your library' : 'Recipe saved to your library');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return (
    <div className="space-y-3">
      <Skeleton height="10rem" />
      <Skeleton height="2rem" />
      <Skeleton height="8rem" />
    </div>
  );

  if (error) return <p className="text-sm text-danger-600 text-center py-8">{error.message}</p>;
  if (!detail) return <p className="text-sm text-neutral-400 text-center py-8">Recipe not found</p>;

  const { recipe } = detail;
  const steps = recipe.instructions?.split('\n') ?? [];

  return (
    <div className="space-y-4">
      {detail.image && (
        <img src={`${detail.image}/medium`} alt={detail.title} className="w-full h-44 object-cover rounded-xl" />
      )}

      <div>
        <h2 className="text-base font-semibold text-neutral-900">{detail.title}</h2>
        <p className="text-xs text-neutral-500 mt-1">
          {[detail.category, detail.cuisine].filter(Boolean).join(' · ')}
        </p>
        <div className="flex gap-3 mt-2">
          {safeUrl(detail.youtubeUrl) && (
            <a href={safeUrl(detail.youtubeUrl)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
              <IconBrandYoutube size={14} /> Watch video
            </a>
          )}
          {safeUrl(detail.sourceUrl) && (
            <a href={safeUrl(detail.sourceUrl)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
              <IconExternalLink size={14} /> Original recipe
            </a>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 mb-2">Ingredients ({recipe.ingredients.length})</p>
        <ul className="space-y-1">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="text-xs text-neutral-600 flex gap-2" title={ing.original ? `TheMealDB: "${ing.original}"` : undefined}>
              <span className="font-medium w-14 text-right shrink-0">
                {formatQty(ing.quantity)}{ing.unit ? ` ${ing.unit}` : ''}
              </span>
              <span>{ing.name}{ing.isOptional ? ' (optional)' : ''}</span>
            </li>
          ))}
        </ul>
      </div>

      {steps.length > 0 && (
        <div>
          <p className="text-sm font-medium text-neutral-700 mb-2">Instructions ({steps.length} steps)</p>
          <p className="text-xs text-neutral-600 line-clamp-5">{steps.join(' ')}</p>
        </div>
      )}

      <div className="bg-neutral-50 rounded-xl p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-600 mb-1">Servings</span>
            <input
              type="number" min={1} max={50} value={servings}
              onChange={(e) => setServings(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-neutral-600 mb-1">Meal type</span>
            <select
              value={mealType} onChange={(e) => setMealType(e.target.value)}
              className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              {MEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <input type="checkbox" checked={isKidFriendly} onChange={(e) => setIsKidFriendly(e.target.checked)} />
          Kid-friendly
        </label>
        <p className="text-xs text-neutral-400">
          TheMealDB doesn't list servings or macros. Check the servings count; after importing, use Edit → Calculate from ingredients for macros.
        </p>
      </div>

      {detail.libraryRecipeId ? (
        <button disabled className="w-full py-2.5 text-sm font-semibold text-neutral-500 bg-neutral-100 rounded-lg">
          Already in your library
        </button>
      ) : (
        <button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {importMutation.isPending ? 'Importing...' : 'Import to my library'}
        </button>
      )}
    </div>
  );
}

const selectClass = 'px-3 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-600';

export default function MealDbSearch() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 350);

  const { data: filters } = useQuery({
    queryKey: ['mealdb-filters'],
    queryFn: getMealDbFilters,
    staleTime: Infinity,
  });

  const enabled = debouncedQuery.length >= 2 || !!category || !!country;

  const { data, isFetching, error } = useQuery({
    queryKey: ['mealdb-search', debouncedQuery, category, country],
    queryFn: () => searchMealDb({
      query: debouncedQuery || undefined,
      category: category || undefined,
      country: country || undefined,
    }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const results = data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by dish or main ingredient (e.g. lasagne, chicken)..."
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
          <option value="">All categories</option>
          {filters?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass}>
          <option value="">All countries</option>
          {filters?.countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-neutral-400">Free recipes from TheMealDB</span>
      </div>

      {!enabled && (
        <p className="text-sm text-neutral-400 text-center py-8">Type a dish or ingredient, or pick a category or country</p>
      )}

      {enabled && error && (
        <p className="text-sm text-danger-600 text-center py-8">{error.message}</p>
      )}

      {enabled && isFetching && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} height="10rem" className="rounded-xl" />)}
        </div>
      )}

      {enabled && !isFetching && !error && results.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-8">No results found</p>
      )}

      {enabled && !isFetching && results.length > 0 && (
        <>
          <p className="text-xs text-neutral-400">{results.length} recipe{results.length === 1 ? '' : 's'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r) => <MealDbCard key={r.id} result={r} onView={(res) => setSelectedId(res.id)} />)}
          </div>
        </>
      )}

      <BottomSheet isOpen={!!selectedId} onClose={() => setSelectedId(null)} title="Recipe details">
        {selectedId && <MealDbDetail mealDbId={selectedId} onClose={() => setSelectedId(null)} />}
      </BottomSheet>
    </div>
  );
}
