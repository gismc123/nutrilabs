import { useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import Badge from '../ui/Badge.jsx';
import MealPickerSheet from './MealPickerSheet.jsx';
import { centsToDisplay } from '../../utils/currency.js';

export default function MealSlot({ mealPlanId, dayOfWeek, mealType, plannedMeal, dayHouseholdMode }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const recipe = plannedMeal?.recipe;
  const isKidUnfriendly = recipe && !recipe.isKidFriendly && dayHouseholdMode === 'DAD_MODE';

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        className="w-full text-left p-2.5 rounded-lg border border-neutral-100 bg-neutral-50 hover:bg-white hover:border-neutral-200 transition-colors min-h-[64px] flex flex-col gap-1"
      >
        {recipe ? (
          <>
            <span className="text-xs font-medium text-neutral-800 leading-tight line-clamp-2">{recipe.name}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {recipe.calories && (
                <span className="text-xs text-neutral-400">{recipe.calories} cal</span>
              )}
              {recipe.costPerServing && (
                <span className="text-xs text-neutral-400">{centsToDisplay(Math.round(recipe.costPerServing * 100))}/srv</span>
              )}
              {isKidUnfriendly && (
                <span title="Not kid-friendly" className="text-accent-600">
                  <IconAlertTriangle size={12} />
                </span>
              )}
              {recipe.source === 'SPOONACULAR' && <Badge label="Imported" variant="info" />}
              {recipe.source === 'AI' && <Badge label="AI" variant="purple" />}
            </div>
          </>
        ) : (
          <span className="text-xs text-neutral-400">+ Add</span>
        )}
      </button>

      <MealPickerSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mealPlanId={mealPlanId}
        dayOfWeek={dayOfWeek}
        mealType={mealType}
      />
    </>
  );
}
