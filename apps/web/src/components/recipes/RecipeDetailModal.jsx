import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import BottomSheet from '../ui/BottomSheet.jsx';
import Badge from '../ui/Badge.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import RecipeForm from './RecipeForm.jsx';
import { getRecipe, updateRecipe, deleteRecipe, updateMealPlanMeals, getMealPlanWeek } from '../../api/client.js';
import { useUiStore } from '../../store/uiStore.js';
import { centsToDisplay } from '../../utils/currency.js';
import { formatDate } from '../../utils/dates.js';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'];
const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };
const DAY_LABELS = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };

function AddToPlanPicker({ recipeId, onClose }) {
  const [day, setDay] = useState('MON');
  const [mealType, setMealType] = useState('DINNER');
  const queryClient = useQueryClient();
  const today = formatDate(new Date());

  const { data: weekPlan } = useQuery({
    queryKey: ['mealplan-week', today],
    queryFn: () => getMealPlanWeek(today),
  });

  const assignMutation = useMutation({
    mutationFn: () => updateMealPlanMeals(weekPlan?.id, { dayOfWeek: day, mealType, recipeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      toast.success('Added to plan');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!weekPlan) return <Skeleton height="6rem" />;

  return (
    <div className="space-y-3 border-t border-neutral-100 pt-4 mt-4">
      <p className="text-sm font-medium text-neutral-700">Add to current week</p>
      <div className="flex gap-2">
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        >
          {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
        </select>
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        >
          {MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
        </select>
      </div>
      <button
        onClick={() => assignMutation.mutate()}
        disabled={assignMutation.isPending}
        className="w-full py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
      >
        {assignMutation.isPending ? 'Adding...' : 'Assign to plan'}
      </button>
    </div>
  );
}

export default function RecipeDetailModal({ recipe: recipeSummary, isOpen, onClose }) {
  const [editOpen, setEditOpen] = useState(false);
  const [addToPlanOpen, setAddToPlanOpen] = useState(false);
  const [servings, setServings] = useState(1);
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);

  const { data: recipe, isLoading } = useQuery({
    queryKey: ['recipe', recipeSummary?.id],
    queryFn: () => getRecipe(recipeSummary.id),
    enabled: isOpen && !!recipeSummary?.id,
  });

  const toggleKidFriendlyMutation = useMutation({
    mutationFn: (isKidFriendly) =>
      updateRecipe(recipe.id, { ...recipe, isKidFriendly, ingredients: recipe.ingredients ?? [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipe.id] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(recipe.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = () => {
    showConfirm(
      'Delete recipe?',
      `"${recipe?.name}" will be permanently deleted and removed from any meal plans.`,
      () => deleteMutation.mutate()
    );
  };

  const baseServings = recipe?.servings ?? 1;
  const scale = servings / baseServings;

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose} title={recipe?.name ?? recipeSummary?.name}>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton height="1.5rem" />
            <Skeleton height="1rem" width="60%" />
            <Skeleton height="6rem" />
          </div>
        ) : recipe ? (
          <div className="space-y-4">
            {recipe.tags?.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {recipe.tags.map((tag) => <Badge key={tag} label={tag} variant="default" />)}
              </div>
            )}

            {/* Serving scaler */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-neutral-700">Servings</label>
              <input
                type="number"
                min="1"
                value={servings}
                onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 px-2 py-1 border border-neutral-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              {servings !== baseServings && (
                <span className="text-xs text-neutral-400">base: {baseServings}</span>
              )}
            </div>

            {/* Ingredients */}
            {recipe.ingredients?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-neutral-700 mb-2">Ingredients</p>
                <ul className="space-y-1">
                  {recipe.ingredients.map((ing, i) => {
                    const scaledQty = ing.quantity != null
                      ? Math.round(ing.quantity * scale * 10) / 10
                      : null;
                    return (
                      <li key={i} className="text-sm text-neutral-600 flex gap-2">
                        {scaledQty != null && <span className="font-medium w-8 text-right shrink-0">{scaledQty}</span>}
                        <span>{ing.unit && `${ing.unit} `}{ing.name}{ing.isOptional ? ' (optional)' : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Instructions */}
            {recipe.instructions && (
              <div>
                <p className="text-sm font-semibold text-neutral-700 mb-2">Instructions</p>
                <ol className="space-y-1.5 list-decimal list-inside">
                  {recipe.instructions.split('\n').filter(Boolean).map((step, i) => (
                    <li key={i} className="text-sm text-neutral-600">{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Macros */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Cal', value: recipe.calories },
                { label: 'Protein', value: recipe.proteinG != null ? `${recipe.proteinG}g` : null },
                { label: 'Carbs', value: recipe.carbsG != null ? `${recipe.carbsG}g` : null },
                { label: 'Fat', value: recipe.fatG != null ? `${recipe.fatG}g` : null },
              ].map(({ label, value }) => (
                <div key={label} className="bg-neutral-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-neutral-400 mb-1">{label}</p>
                  <p className="text-sm font-bold text-neutral-800">{value ?? '—'}</p>
                </div>
              ))}
            </div>

            {/* Kid-friendly toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-700">Kid-friendly</span>
              <button
                onClick={() => toggleKidFriendlyMutation.mutate(!recipe.isKidFriendly)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  recipe.isKidFriendly ? 'bg-primary-600' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    recipe.isKidFriendly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {recipe.source === 'SPOONACULAR' && (
              <p className="text-xs text-neutral-400">Recipe sourced from Spoonacular</p>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                onClick={() => setAddToPlanOpen((v) => !v)}
                className="py-2 text-xs font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Add to plan
              </button>
              <button
                onClick={() => setEditOpen(true)}
                className="py-2 text-xs font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="py-2 text-xs font-medium text-danger-600 border border-danger-200 rounded-lg hover:bg-danger-50 transition-colors"
              >
                Delete
              </button>
            </div>

            {addToPlanOpen && <AddToPlanPicker recipeId={recipe.id} onClose={() => setAddToPlanOpen(false)} />}
          </div>
        ) : null}
      </BottomSheet>

      {recipe && (
        <RecipeForm
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          recipe={recipe}
        />
      )}
    </>
  );
}
