import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconCheck, IconToolsKitchen2 } from '@tabler/icons-react';
import toast from 'react-hot-toast';
import EatOutModal from './EatOutModal.jsx';
import { updateMealPlanMeals } from '../../api/client.js';

const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };

function MealCard({ mealPlanId, dayOfWeek, mealType, plannedMeal, householdMode }) {
  const queryClient = useQueryClient();
  const [eatOutOpen, setEatOutOpen] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: () =>
      updateMealPlanMeals(mealPlanId, {
        dayOfWeek,
        mealType,
        eaten: !plannedMeal?.eaten,
        eatenAt: !plannedMeal?.eaten ? new Date().toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      queryClient.invalidateQueries({ queryKey: ['budget-week'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const recipe = plannedMeal?.recipe;
  const isEaten = plannedMeal?.eaten;

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-100 p-4 flex flex-col gap-2">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">{MEAL_LABELS[mealType]}</p>
        {recipe ? (
          <>
            <p className="text-sm font-semibold text-neutral-900 leading-tight">{recipe.name}</p>
            {recipe.calories && (
              <p className="text-xs text-neutral-500">{recipe.calories} cal</p>
            )}
          </>
        ) : (
          <p className="text-sm italic text-neutral-400">Not planned</p>
        )}
        <div className="flex items-center gap-2 mt-auto pt-1">
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            className={`flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
              isEaten
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-neutral-300 text-neutral-300 hover:border-primary-400 hover:text-primary-400'
            }`}
            title={isEaten ? 'Mark as not eaten' : 'Mark as eaten'}
          >
            <IconCheck size={16} />
          </button>
          <button
            onClick={() => setEatOutOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-600 hover:border-neutral-300 transition-colors"
            title="Log eating out"
          >
            <IconToolsKitchen2 size={15} />
          </button>
        </div>
      </div>

      <EatOutModal
        isOpen={eatOutOpen}
        onClose={() => setEatOutOpen(false)}
        mealType={mealType}
        householdMode={householdMode}
      />
    </>
  );
}

export default function TodayMeals({ mealPlanId, grid }) {
  const DAY_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const todayEnum = DAY_ENUM[new Date().getDay()];
  const todayData = grid?.[todayEnum];
  const meals = todayData?.meals ?? {};
  const householdMode = todayData?.householdMode ?? 'SOLO';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {['BREAKFAST', 'LUNCH', 'DINNER'].map((mealType) => (
        <MealCard
          key={mealType}
          mealPlanId={mealPlanId}
          dayOfWeek={todayEnum}
          mealType={mealType}
          plannedMeal={meals[mealType] ?? null}
          householdMode={householdMode}
        />
      ))}
    </div>
  );
}
