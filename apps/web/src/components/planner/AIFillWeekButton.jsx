import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSparkles } from '@tabler/icons-react';
import { aiSuggestMealPlan, batchUpdateMealPlanMeals, createRecipe } from '../../api/client.js';

const VALID_DAYS = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
const VALID_MEAL_TYPES = new Set(['BREAKFAST', 'LUNCH', 'DINNER']);

const DAY_MAP = {
  MONDAY: 'MON', TUESDAY: 'TUE', WEDNESDAY: 'WED',
  THURSDAY: 'THU', FRIDAY: 'FRI', SATURDAY: 'SAT', SUNDAY: 'SUN',
};
const MEAL_MAP = { LUNCH: 'LUNCH', DINNER: 'DINNER', BREAKFAST: 'BREAKFAST', BRUNCH: 'BREAKFAST' };

function normalizeDay(s) {
  if (typeof s !== 'string') return s;
  const up = s.trim().toUpperCase();
  return DAY_MAP[up] ?? up;
}

function normalizeMeal(s) {
  if (typeof s !== 'string') return s;
  const up = s.trim().toUpperCase();
  return MEAL_MAP[up] ?? up;
}

export default function AIFillWeekButton({ mealPlanId }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleFill = async () => {
    setLoading(true);
    try {
      const suggestions = await aiSuggestMealPlan(mealPlanId, {});

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        toast.error('AI returned no suggestions — try again');
        return;
      }

      // Normalize field casing from model (e.g. "monday" → "MON", "breakfast" → "BREAKFAST")
      const valid = suggestions
        .map((s) => ({
          ...s,
          dayOfWeek: normalizeDay(s.dayOfWeek ?? s.day_of_week ?? s.day),
          mealType: normalizeMeal(s.mealType ?? s.meal_type ?? s.type),
          name: s.name ?? s.meal_name ?? s.title,
        }))
        .filter((s) => VALID_DAYS.has(s.dayOfWeek) && VALID_MEAL_TYPES.has(s.mealType) && s.name);

      if (valid.length === 0) {
        toast.error('AI suggestions had unrecognised fields — try again');
        return;
      }

      const resolved = await Promise.all(
        valid.map((s) =>
          createRecipe({
            name: s.name,
            description: s.description ?? null,
            mealType: s.mealType,
            servings: 1,
            calories: s.estimatedCalories ?? null,
            proteinG: s.estimatedProteinG ?? null,
            carbsG: s.estimatedCarbsG ?? null,
            fatG: s.estimatedFatG ?? null,
            costPerServing: s.estimatedCostPerServing ?? null,
            isKidFriendly: s.isKidFriendly ?? true,
            tags: [],
            ingredients: [],
          }).then((recipe) => ({ dayOfWeek: s.dayOfWeek, mealType: s.mealType, recipeId: recipe.id }))
        )
      );

      await batchUpdateMealPlanMeals(mealPlanId, resolved);
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success(`Week filled with ${resolved.length} AI meals`);
    } catch (err) {
      toast.error(err.message ?? 'AI fill failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleFill}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
    >
      <IconSparkles size={14} />
      {loading ? 'Ivan is planning...' : 'AI fill week'}
    </button>
  );
}
