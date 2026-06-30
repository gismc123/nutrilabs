import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSearch } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';
import Skeleton, { SkeletonCard } from '../ui/Skeleton.jsx';
import Badge from '../ui/Badge.jsx';
import { getRecipes, updateMealPlanMeals, aiSuggestSlot, createRecipe } from '../../api/client.js';
import { useHealth } from '../../hooks/useHealth.js';
import { centsToDisplay } from '../../utils/currency.js';

const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };
const BROWSE_CHIPS = [
  { label: 'Kid-friendly', param: 'isKidFriendly', value: 'true' },
  { label: 'High protein', param: 'tags', value: 'high-protein' },
];

function RecipeListItem({ recipe, onSelect }) {
  return (
    <button
      onClick={() => onSelect(recipe)}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-100 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800 truncate">{recipe.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {recipe.calories && <span className="text-xs text-neutral-400">{recipe.calories} cal</span>}
            {recipe.proteinG && <span className="text-xs text-neutral-400">P {recipe.proteinG}g</span>}
            {recipe.costPerServing && <span className="text-xs text-neutral-400">{centsToDisplay(Math.round(recipe.costPerServing * 100))}/srv</span>}
            {recipe.isKidFriendly && <span className="text-xs text-primary-600">✓ Kid</span>}
          </div>
        </div>
        <Badge label={MEAL_LABELS[recipe.mealType]} variant="default" />
      </div>
    </button>
  );
}

function MyRecipesTab({ mealType, onSelect }) {
  const [search, setSearch] = useState('');
  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes', { mealType }],
    queryFn: () => getRecipes({ mealType }),
  });

  const filtered = search
    ? recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : recipes;

  return (
    <div className="space-y-3">
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} height="3rem" />)}
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">No recipes found</p>
          ) : (
            filtered.map((r) => <RecipeListItem key={r.id} recipe={r} onSelect={onSelect} />)
          )}
        </div>
      )}
    </div>
  );
}

function BrowseTab({ mealType, onSelect }) {
  const [activeChips, setActiveChips] = useState([]);
  const params = { mealType };
  activeChips.forEach(({ param, value }) => { params[param] = value; });

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes-browse', params],
    queryFn: () => getRecipes(params),
  });

  const toggleChip = (chip) => {
    setActiveChips((prev) =>
      prev.find((c) => c.label === chip.label)
        ? prev.filter((c) => c.label !== chip.label)
        : [...prev, chip]
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {BROWSE_CHIPS.map((chip) => {
          const active = activeChips.find((c) => c.label === chip.label);
          return (
            <button
              key={chip.label}
              onClick={() => toggleChip(chip)}
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
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} height="3rem" />)}
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {recipes.map((r) => <RecipeListItem key={r.id} recipe={r} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

function AISuggestTab({ mealPlanId, dayOfWeek, mealType, onClose }) {
  const { health } = useHealth();
  const queryClient = useQueryClient();
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const saveAndAssignMutation = useMutation({
    mutationFn: async ({ suggestion, assign }) => {
      const recipe = await createRecipe({
        name: suggestion.name,
        description: suggestion.description ?? null,
        mealType,
        servings: 1,
        calories: suggestion.estimatedCalories ?? null,
        proteinG: suggestion.estimatedProteinG ?? null,
        carbsG: suggestion.estimatedCarbsG ?? null,
        fatG: suggestion.estimatedFatG ?? null,
        costPerServing: suggestion.estimatedCostPerServing ?? null,
        isKidFriendly: suggestion.isKidFriendly ?? true,
        tags: [],
        ingredients: [],
        source: 'AI',
      });
      if (assign) {
        await updateMealPlanMeals(mealPlanId, { dayOfWeek, mealType, recipeId: recipe.id });
      }
      return recipe;
    },
    onSuccess: (_, { assign }) => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success(assign ? 'Recipe added to plan' : 'Recipe saved to library');
      if (assign) onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSuggest = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await aiSuggestSlot(mealPlanId, { dayOfWeek, mealType });
      setSuggestions(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!health?.ollamaConnected) {
    return (
      <p className="text-sm text-neutral-500 text-center py-6">
        AI suggestions unavailable — check Ollama connection in Settings
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!suggestions && !loading && (
        <button
          onClick={handleSuggest}
          className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          Suggest for this slot
        </button>
      )}

      {loading && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <p className="text-xs text-center text-neutral-400">Ivan is thinking...</p>
        </div>
      )}

      {error && <p className="text-sm text-danger-600 text-center">{error}</p>}

      {suggestions && (
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <div key={i} className="border border-neutral-100 rounded-xl p-3 space-y-2">
              <p className="text-sm font-semibold text-neutral-900">{s.name}</p>
              {s.description && <p className="text-xs text-neutral-500 line-clamp-2">{s.description}</p>}
              <div className="flex gap-1.5 flex-wrap">
                {s.estimatedCalories && <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">{s.estimatedCalories} cal</span>}
                {s.estimatedProteinG && <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">P {s.estimatedProteinG}g</span>}
                {s.estimatedCostPerServing && <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">${s.estimatedCostPerServing}/srv</span>}
              </div>
              {s.reason && <p className="text-xs text-neutral-400 italic">{s.reason}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => saveAndAssignMutation.mutate({ suggestion: s, assign: true })}
                  disabled={saveAndAssignMutation.isPending}
                  className="flex-1 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  Add to plan
                </button>
                <button
                  onClick={() => saveAndAssignMutation.mutate({ suggestion: s, assign: false })}
                  disabled={saveAndAssignMutation.isPending}
                  className="flex-1 py-1.5 text-xs font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                >
                  Save to library
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = ['My recipes', 'Browse', 'Ask AI'];

export default function MealPickerSheet({ isOpen, onClose, mealPlanId, dayOfWeek, mealType }) {
  const [activeTab, setActiveTab] = useState(0);
  const queryClient = useQueryClient();

  const assignMutation = useMutation({
    mutationFn: (recipeId) => updateMealPlanMeals(mealPlanId, { dayOfWeek, mealType, recipeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      toast.success('Recipe added to plan');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Pick a ${mealType?.toLowerCase() ?? 'meal'}`}>
      <div className="space-y-4">
        <div className="flex border-b border-neutral-100">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
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
          <MyRecipesTab mealType={mealType} onSelect={(r) => assignMutation.mutate(r.id)} />
        )}
        {activeTab === 1 && (
          <BrowseTab mealType={mealType} onSelect={(r) => assignMutation.mutate(r.id)} />
        )}
        {activeTab === 2 && (
          <AISuggestTab
            mealPlanId={mealPlanId}
            dayOfWeek={dayOfWeek}
            mealType={mealType}
            onClose={onClose}
          />
        )}
      </div>
    </BottomSheet>
  );
}
