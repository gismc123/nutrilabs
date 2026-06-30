import Badge from '../ui/Badge.jsx';
import { centsToDisplay } from '../../utils/currency.js';

const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };

export default function RecipeCard({ recipe, onClick }) {
  return (
    <button
      onClick={() => onClick(recipe)}
      className="w-full text-left bg-white border border-neutral-100 rounded-xl p-4 hover:border-neutral-200 hover:shadow-sm transition-all space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-900 leading-tight">{recipe.name}</h3>
        <Badge label={MEAL_LABELS[recipe.mealType] ?? recipe.mealType} variant="default" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {recipe.costPerServing != null && (
          <span className="text-xs text-neutral-500">{centsToDisplay(Math.round(recipe.costPerServing * 100))}/srv</span>
        )}
        {recipe.prepTimeMinutes && (
          <span className="text-xs text-neutral-500">{recipe.prepTimeMinutes} min</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {recipe.calories && (
          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">{recipe.calories} cal</span>
        )}
        {recipe.proteinG != null && (
          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">P {recipe.proteinG}g</span>
        )}
        {recipe.carbsG != null && (
          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">C {recipe.carbsG}g</span>
        )}
        {recipe.fatG != null && (
          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">F {recipe.fatG}g</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {recipe.isKidFriendly && (
          <span className="text-xs text-primary-600 font-medium">✓ Kid-friendly</span>
        )}
        {recipe.source === 'AI' && <Badge label="AI" variant="purple" />}
        {recipe.source === 'SPOONACULAR' && <Badge label="Imported" variant="info" />}
      </div>
    </button>
  );
}
