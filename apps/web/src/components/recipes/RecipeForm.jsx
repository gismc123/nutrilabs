import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconPlus, IconTrash, IconSearch } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';
import { createRecipe, updateRecipe, estimateMacros, searchIngredient } from '../../api/client.js';
import { useHealth } from '../../hooks/useHealth.js';

const EMPTY_INGREDIENT = { quantity: '', unit: '', name: '', isOptional: false };

function IngredientRow({ ing, idx, onChange, onRemove }) {
  const [nutritionPopover, setNutritionPopover] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const handleLookup = async () => {
    if (!ing.name) return;
    setLookupLoading(true);
    try {
      const results = await searchIngredient(ing.name);
      if (results?.length) {
        setNutritionPopover(results[0]);
      }
    } catch {
      // silently ignore USDA failures
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={ing.quantity}
          onChange={(e) => onChange(idx, 'quantity', e.target.value)}
          placeholder="Qty"
          className="w-16 px-2 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <input
          type="text"
          value={ing.unit}
          onChange={(e) => onChange(idx, 'unit', e.target.value)}
          placeholder="Unit"
          className="w-16 px-2 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <input
          type="text"
          value={ing.name}
          onChange={(e) => onChange(idx, 'name', e.target.value)}
          placeholder="Ingredient name"
          className="flex-1 px-2 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={lookupLoading || !ing.name}
          title="Look up nutrition"
          className="p-1.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 transition-colors"
        >
          <IconSearch size={14} />
        </button>
        <label className="flex items-center gap-1 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={ing.isOptional}
            onChange={(e) => onChange(idx, 'isOptional', e.target.checked)}
            className="rounded"
          />
          Opt
        </label>
        <button type="button" onClick={() => onRemove(idx)} className="text-danger-400 hover:text-danger-600 transition-colors">
          <IconTrash size={14} />
        </button>
      </div>

      {nutritionPopover && (
        <div className="absolute z-10 left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 text-xs space-y-1 min-w-[200px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-800">{nutritionPopover.name} (per 100g)</span>
            <button onClick={() => setNutritionPopover(null)} className="text-neutral-400 hover:text-neutral-700">×</button>
          </div>
          {nutritionPopover.calories != null && <div>Calories: {Math.round(nutritionPopover.calories)}</div>}
          {nutritionPopover.protein != null && <div>Protein: {Math.round(nutritionPopover.protein)}g</div>}
          {nutritionPopover.carbs != null && <div>Carbs: {Math.round(nutritionPopover.carbs)}g</div>}
          {nutritionPopover.fat != null && <div>Fat: {Math.round(nutritionPopover.fat)}g</div>}
        </div>
      )}
    </div>
  );
}

export default function RecipeForm({ isOpen, onClose, recipe = null }) {
  const queryClient = useQueryClient();
  const { health } = useHealth();
  const isEdit = !!recipe;

  const [form, setForm] = useState({
    name: '',
    description: '',
    mealType: 'DINNER',
    servings: 1,
    prepTimeMinutes: '',
    costPerServing: '',
    isKidFriendly: true,
    tags: [],
    ingredients: [{ ...EMPTY_INGREDIENT }],
    instructions: '',
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
  });

  const [tagInput, setTagInput] = useState('');
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    if (isOpen && recipe) {
      setForm({
        name: recipe.name ?? '',
        description: recipe.description ?? '',
        mealType: recipe.mealType ?? 'DINNER',
        servings: recipe.servings ?? 1,
        prepTimeMinutes: recipe.prepTimeMinutes ?? '',
        costPerServing: recipe.costPerServing ?? '',
        isKidFriendly: recipe.isKidFriendly ?? true,
        tags: recipe.tags ?? [],
        ingredients: recipe.ingredients?.length
          ? recipe.ingredients.map((i) => ({
              quantity: i.quantity ?? '',
              unit: i.unit ?? '',
              name: i.name ?? '',
              isOptional: i.isOptional ?? false,
            }))
          : [{ ...EMPTY_INGREDIENT }],
        instructions: recipe.instructions ?? '',
        calories: recipe.calories ?? '',
        proteinG: recipe.proteinG ?? '',
        carbsG: recipe.carbsG ?? '',
        fatG: recipe.fatG ?? '',
      });
    } else if (isOpen && !recipe) {
      setForm({
        name: '',
        description: '',
        mealType: 'DINNER',
        servings: 1,
        prepTimeMinutes: '',
        costPerServing: '',
        isKidFriendly: true,
        tags: [],
        ingredients: [{ ...EMPTY_INGREDIENT }],
        instructions: '',
        calories: '',
        proteinG: '',
        carbsG: '',
        fatG: '',
      });
    }
  }, [isOpen, recipe]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateRecipe(recipe.id, data) : createRecipe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['recipe', recipe.id] });
      toast.success(isEdit ? 'Recipe updated' : 'Recipe created');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleIngredientChange = (idx, field, value) => {
    setForm((f) => {
      const ings = [...f.ingredients];
      ings[idx] = { ...ings[idx], [field]: value };
      return { ...f, ingredients: ings };
    });
  };

  const handleIngredientRemove = (idx) => {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  };

  const handleAddIngredient = () => {
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, { ...EMPTY_INGREDIENT }] }));
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (!form.tags.includes(tag)) {
        setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
      }
      setTagInput('');
    }
  };

  const removeTag = (tag) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const handleEstimateMacros = async () => {
    const namedIngredients = form.ingredients
      .filter((i) => i.name)
      .map((i) => `${i.quantity || ''} ${i.unit || ''} ${i.name}`.trim());

    if (!form.name || !namedIngredients.length) {
      toast.error('Add a name and at least one ingredient first');
      return;
    }

    setEstimating(true);
    try {
      const result = await estimateMacros({ recipeName: form.name, ingredients: namedIngredients });
      setForm((f) => ({
        ...f,
        calories: result.calories ?? f.calories,
        proteinG: result.proteinG ?? f.proteinG,
        carbsG: result.carbsG ?? f.carbsG,
        fatG: result.fatG ?? f.fatG,
        costPerServing: result.costPerServingEstimate ?? f.costPerServing,
      }));
      toast.success('Macros estimated');
    } catch (err) {
      toast.error(err.message ?? 'Estimation failed');
    } finally {
      setEstimating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      name: form.name,
      description: form.description || null,
      mealType: form.mealType,
      servings: parseInt(form.servings) || 1,
      prepTimeMinutes: form.prepTimeMinutes ? parseInt(form.prepTimeMinutes) : null,
      costPerServing: form.costPerServing ? parseFloat(form.costPerServing) : null,
      isKidFriendly: form.isKidFriendly,
      tags: form.tags,
      ingredients: form.ingredients
        .filter((i) => i.name)
        .map((i) => ({
          name: i.name,
          quantity: i.quantity ? parseFloat(i.quantity) : null,
          unit: i.unit || null,
          isOptional: i.isOptional,
        })),
      instructions: form.instructions || null,
      calories: form.calories ? parseInt(form.calories) : null,
      proteinG: form.proteinG ? parseInt(form.proteinG) : null,
      carbsG: form.carbsG ? parseInt(form.carbsG) : null,
      fatG: form.fatG ? parseInt(form.fatG) : null,
    });
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit recipe' : 'New recipe'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Description</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
          />
        </div>

        {/* Row: mealType + servings */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Meal type *</label>
            <select
              required
              value={form.mealType}
              onChange={(e) => setForm((f) => ({ ...f, mealType: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <option value="BREAKFAST">Breakfast</option>
              <option value="LUNCH">Lunch</option>
              <option value="DINNER">Dinner</option>
              <option value="SNACK">Snack</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Servings</label>
            <input
              type="number"
              min="1"
              value={form.servings}
              onChange={(e) => setForm((f) => ({ ...f, servings: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
        </div>

        {/* Row: prep time + cost */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Prep time (min)</label>
            <input
              type="number"
              min="1"
              value={form.prepTimeMinutes}
              onChange={(e) => setForm((f) => ({ ...f, prepTimeMinutes: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Cost per serving ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.costPerServing}
              onChange={(e) => setForm((f) => ({ ...f, costPerServing: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
        </div>

        {/* Kid-friendly */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-neutral-700">Kid-friendly</label>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, isKidFriendly: !f.isKidFriendly }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              form.isKidFriendly ? 'bg-primary-600' : 'bg-neutral-200'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              form.isKidFriendly ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Tags (press Enter to add)</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 text-xs rounded-full">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="text-neutral-400 hover:text-neutral-700">×</button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="e.g. high-protein"
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>

        {/* Ingredients */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-2">Ingredients</label>
          <div className="space-y-2">
            {form.ingredients.map((ing, idx) => (
              <IngredientRow
                key={idx}
                ing={ing}
                idx={idx}
                onChange={handleIngredientChange}
                onRemove={handleIngredientRemove}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddIngredient}
            className="mt-2 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            <IconPlus size={13} /> Add ingredient
          </button>
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Instructions (one step per line)</label>
          <textarea
            rows={4}
            value={form.instructions}
            onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
          />
        </div>

        {/* Macros */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-neutral-700">Macros (per serving)</label>
            {health?.ollamaConnected ? (
              <button
                type="button"
                onClick={handleEstimateMacros}
                disabled={estimating}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
              >
                {estimating ? 'Estimating...' : 'Estimate with AI'}
              </button>
            ) : (
              <span className="text-xs text-neutral-400">AI unavailable</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Cal', key: 'calories' },
              { label: 'Protein g', key: 'proteinG' },
              { label: 'Carbs g', key: 'carbsG' },
              { label: 'Fat g', key: 'fatG' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs text-neutral-500 mb-1">{label}</label>
                <input
                  type="number"
                  min="0"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-neutral-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-600"
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Saving...' : isEdit ? 'Save changes' : 'Create recipe'}
        </button>
      </form>
    </BottomSheet>
  );
}
