import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSearch } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { searchExternalRecipes, getExternalRecipe, importRecipe } from '../../api/client.js';

function ExternalRecipeCard({ result, onView }) {
  return (
    <button
      onClick={() => onView(result)}
      className="w-full text-left bg-white border border-neutral-100 rounded-xl overflow-hidden hover:border-neutral-200 hover:shadow-sm transition-all"
    >
      {result.image && (
        <img src={result.image} alt={result.title} className="w-full h-32 object-cover" />
      )}
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-neutral-900 line-clamp-2">{result.title}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {result.readyInMinutes && (
            <span className="text-xs text-neutral-500">{result.readyInMinutes} min</span>
          )}
          {result.pricePerServing && (
            <span className="text-xs text-neutral-500">${(result.pricePerServing / 100).toFixed(2)}/srv</span>
          )}
          {result.diets?.slice(0, 2).map((d) => (
            <span key={d} className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-500 capitalize">{d}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

function ExternalRecipeDetail({ spoonacularId, onClose }) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['external-recipe', spoonacularId],
    queryFn: () => getExternalRecipe(spoonacularId),
    enabled: !!spoonacularId,
  });

  const importMutation = useMutation({
    mutationFn: () => importRecipe(spoonacularId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe saved to your library');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return (
    <div className="space-y-3">
      <Skeleton height="2rem" />
      <Skeleton height="1rem" width="60%" />
      <Skeleton height="8rem" />
    </div>
  );

  if (!detail) return <p className="text-sm text-neutral-400 text-center py-8">Recipe not found</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">{detail.title}</h2>
        {detail.readyInMinutes && <p className="text-xs text-neutral-500 mt-1">{detail.readyInMinutes} min prep</p>}
      </div>

      {detail.extendedIngredients?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-neutral-700 mb-2">Ingredients</p>
          <ul className="space-y-1">
            {detail.extendedIngredients.map((ing, i) => (
              <li key={i} className="text-xs text-neutral-600">{ing.original}</li>
            ))}
          </ul>
        </div>
      )}

      {detail.instructions && (
        <div>
          <p className="text-sm font-medium text-neutral-700 mb-2">Instructions (preview)</p>
          <p className="text-xs text-neutral-600 line-clamp-5">{detail.instructions}</p>
        </div>
      )}

      <button
        onClick={() => importMutation.mutate()}
        disabled={importMutation.isPending}
        className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
      >
        {importMutation.isPending ? 'Importing...' : 'Import to my library'}
      </button>
    </div>
  );
}

const DIET_OPTIONS = ['Vegetarian', 'Gluten-free', 'Dairy-free'];

export default function ExternalRecipeSearch() {
  const [query, setQuery] = useState('');
  const [mealType, setMealType] = useState('');
  const [activeDiets, setActiveDiets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const enabled = query.length >= 3;

  const { data: searchData, isLoading, isFetching } = useQuery({
    queryKey: ['external-recipes', query, mealType, activeDiets],
    queryFn: () => searchExternalRecipes({
      query,
      type: mealType || undefined,
      diet: activeDiets.join(',') || undefined,
    }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const results = searchData?.results ?? [];
  const quota = searchData?.quota;

  const toggleDiet = (diet) => {
    setActiveDiets((prev) =>
      prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet]
    );
  };

  const handleView = (result) => {
    setSelectedId(result.id);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Spoonacular (min 3 characters)..."
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
          className="px-3 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-600"
        >
          <option value="">All types</option>
          <option value="breakfast">Breakfast</option>
          <option value="main course">Dinner</option>
          <option value="lunch">Lunch</option>
          <option value="snack">Snack</option>
        </select>

        {DIET_OPTIONS.map((diet) => (
          <button
            key={diet}
            onClick={() => toggleDiet(diet.toLowerCase().replace('-', ' '))}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              activeDiets.includes(diet.toLowerCase().replace('-', ' '))
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            {diet}
          </button>
        ))}
      </div>

      {/* Results */}
      {!enabled && (
        <p className="text-sm text-neutral-400 text-center py-8">Type at least 3 characters to search</p>
      )}

      {enabled && (isLoading || isFetching) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} height="10rem" className="rounded-xl" />)}
        </div>
      )}

      {enabled && !isLoading && !isFetching && results.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-8">No results found</p>
      )}

      {enabled && results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((r) => (
            <ExternalRecipeCard key={r.id} result={r} onView={handleView} />
          ))}
        </div>
      )}

      {quota?.pointsLeft != null && (
        <div className="flex justify-center gap-4 text-xs text-neutral-400 text-center">
          <span>Points used today: <span className="font-medium text-neutral-600">{quota.pointsUsed}</span></span>
          <span>·</span>
          <span>Points left: <span className="font-medium text-neutral-600">{quota.pointsLeft}</span></span>
          {quota.pointsUsedByRequest != null && (
            <>
              <span>·</span>
              <span>Last request: <span className="font-medium text-neutral-600">{quota.pointsUsedByRequest} pts</span></span>
            </>
          )}
        </div>
      )}

      <BottomSheet isOpen={detailOpen} onClose={() => setDetailOpen(false)} title="Recipe details">
        {selectedId && (
          <ExternalRecipeDetail spoonacularId={selectedId} onClose={() => setDetailOpen(false)} />
        )}
      </BottomSheet>
    </div>
  );
}
