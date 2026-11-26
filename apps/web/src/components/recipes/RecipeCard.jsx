import { IconTrash } from '@tabler/icons-react';
import Badge from '../ui/Badge.jsx';
import RecipeImage from './RecipeImage.jsx';
import { centsToDisplay } from '../../utils/currency.js';

const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };

export default function RecipeCard({ recipe, onClick, onDelete }) {
  return (
    <div className="relative group h-full">
    <button
      onClick={() => onClick(recipe)}
      className="w-full h-full flex flex-col justify-start text-left bg-white border border-neutral-100 rounded-xl p-4 hover:border-neutral-200 hover:shadow-sm transition-all space-y-2"
    >
      <RecipeImage src={recipe.imageUrl} alt={recipe.name} className="-mx-4 -mt-4 mb-3 w-[calc(100%+2rem)] max-w-none h-32 object-cover rounded-t-xl" />
      <div className={`flex items-start justify-between gap-2 ${onDelete && !recipe.imageUrl ? 'pr-8' : ''}`}>
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
        {['SPOONACULAR', 'THEMEALDB', 'WEB'].includes(recipe.source) && <Badge label="Imported" variant="info" />}
        {recipe.userId == null && <Badge label="Starter" variant="default" />}
      </div>
    </button>
    {onDelete && (
      <button
        onClick={() => onDelete(recipe)}
        title={recipe.userId == null ? 'Remove from my library' : 'Delete recipe'}
        aria-label={recipe.userId == null ? `Remove ${recipe.name} from my library` : `Delete ${recipe.name}`}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 border border-neutral-200 text-neutral-400 hover:text-danger-600 hover:border-danger-200 shadow-sm md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <IconTrash size={15} />
      </button>
    )}
    </div>
  );
}
