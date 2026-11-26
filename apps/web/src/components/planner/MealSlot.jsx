import { useState } from 'react';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import Badge from '../ui/Badge.jsx';
import MealPickerSheet from './MealPickerSheet.jsx';
import SidesSheet from './SidesSheet.jsx';
import { centsToDisplay } from '../../utils/currency.js';

export default function MealSlot({ mealPlanId, dayOfWeek, mealType, plannedMeal, dayHouseholdMode }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sidesOpen, setSidesOpen] = useState(false);

  const recipe = plannedMeal?.recipe;
  const sides = plannedMeal?.sides ?? [];
  const isKidUnfriendly = recipe && !recipe.isKidFriendly && dayHouseholdMode === 'DAD_MODE';

  return (
    <>
      <div className="rounded-lg border border-neutral-100 bg-neutral-50 hover:border-neutral-200 transition-colors">
      <button
        onClick={() => setPickerOpen(true)}
        className="w-full text-left p-2.5 rounded-lg hover:bg-white transition-colors min-h-[64px] flex flex-col gap-1"
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
              {['SPOONACULAR', 'THEMEALDB', 'WEB'].includes(recipe.source) && <Badge label="Imported" variant="info" />}
              {recipe.source === 'AI' && <Badge label="AI" variant="purple" />}
            </div>
          </>
        ) : (
          <span className="text-xs text-neutral-400">+ Add</span>
        )}
      </button>
      {recipe && (
        <button
          onClick={() => setSidesOpen(true)}
          aria-label={sides.length ? `Sides: ${sides.map((s) => s.name).join(', ')}. Edit sides` : `Add a side to ${recipe.name}`}
          className="w-full text-left px-2.5 pb-2 pt-1.5 border-t border-neutral-100 rounded-b-lg hover:bg-white transition-colors flex flex-col gap-0.5 min-h-9"
        >
          {sides.map((s) => (
            <span key={s.id} className="text-xs text-neutral-600 leading-tight line-clamp-1">+ {s.name}</span>
          ))}
          <span className="flex items-center gap-1 text-xs font-medium text-primary-600">
            <IconPlus size={12} /> {sides.length ? 'Edit sides' : 'Add side'}
          </span>
        </button>
      )}
      </div>

      {recipe && (
        <SidesSheet
          isOpen={sidesOpen}
          onClose={() => setSidesOpen(false)}
          mealPlanId={mealPlanId}
          dayOfWeek={dayOfWeek}
          mealType={mealType}
          plannedMeal={plannedMeal}
        />
      )}

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
