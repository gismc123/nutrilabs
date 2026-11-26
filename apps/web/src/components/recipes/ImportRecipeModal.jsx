import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconLink, IconClipboardText, IconLoader2, IconTrash, IconPlus, IconBookmark, IconAlertTriangle } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';
import RecipeImage from './RecipeImage.jsx';
import { previewWebRecipe, createRecipe, getMealPlanWeek, updateMealPlanMeals } from '../../api/client.js';
import { formatDate } from '../../utils/dates.js';

const MEAL_TYPES = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
  { value: 'SNACK', label: 'Snack' },
];
const PLAN_SLOTS = MEAL_TYPES.filter((m) => m.value !== 'SNACK');
const UTC_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const METHOD_NOTE = {
  structured: { text: 'Read from the recipe data on the page.', warn: false },
  bookmarklet: { text: 'Read from the page you were viewing.', warn: false },
  ai: { text: 'This page had no standard recipe data, so your AI read it. Double-check the ingredients.', warn: true },
};

const inputClass = 'w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600';
const smallInput = 'px-2 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-600';

function useElapsed(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return secs;
}

/**
 * The "Save to NutriLabs" bookmarklet: run on a recipe page in the user's own
 * browser, it finds the schema.org Recipe the page already loaded (or, failing
 * that, the page text) and opens NutriLabs with it in the URL fragment.
 */
export function bookmarkletCode(origin) {
  const src = `(()=>{const f=(n,d)=>{if(!n||typeof n!='object'||d>6)return null;if(Array.isArray(n)){for(const x of n){const r=f(x,d+1);if(r)return r}return null}if([].concat(n['@type']||[]).some(t=>/Recipe$/i.test(t)))return n;for(const k of['@graph','mainEntity','mainEntityOfPage','itemListElement','item']){const r=f(n[k],d+1);if(r)return r}return null};let r=null;for(const s of document.querySelectorAll('script[type="application/ld+json"]')){try{r=f(JSON.parse(s.textContent),0);if(r)break}catch(e){}}const d={pageUrl:location.href};if(r){for(const k of['review','aggregateRating','comment','video','author','publisher'])delete r[k];d.jsonld=[JSON.stringify(r)]}else{d.text=document.body.innerText.slice(0,28000)}window.open('${origin}/recipes#import='+encodeURIComponent(JSON.stringify(d)),'_blank')})()`;
  return `javascript:${encodeURIComponent(src)}`;
}

function BookmarkletHelp() {
  const ref = useRef(null);
  // React warns about javascript: hrefs, so set it on the element directly.
  useEffect(() => { ref.current?.setAttribute('href', bookmarkletCode(window.location.origin)); }, []);
  return (
    <div className="bg-neutral-50 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5"><IconBookmark size={14} /> Save from any recipe site</p>
      <p className="text-xs text-neutral-500">
        Some big sites (Allrecipes, Simply Recipes, Serious Eats, Budget Bytes…) block automatic imports.
        Drag this button to your bookmarks bar, then click it while you're on any recipe page:
      </p>
      <a
        ref={ref}
        onClick={(e) => { e.preventDefault(); toast('Drag this button to your bookmarks bar, then click it on a recipe page'); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded-lg cursor-grab"
      >
        <IconBookmark size={13} /> Save to NutriLabs
      </a>
      <p className="text-xs text-neutral-400">On a phone: copy the recipe text and use “Paste text”.</p>
    </div>
  );
}

function RecipeEditor({ draft, setDraft }) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setIng = (i, patch) => set({ ingredients: draft.ingredients.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)) });

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {draft.imageUrl && (
          <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-neutral-100">
            <RecipeImage src={draft.imageUrl} alt={draft.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={200} className={`${inputClass} font-semibold`} aria-label="Recipe name" />
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-[11px] text-neutral-500 mb-0.5">Meal type</span>
              <select value={draft.mealType} onChange={(e) => set({ mealType: e.target.value })} className={`${smallInput} w-full`}>
                {MEAL_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] text-neutral-500 mb-0.5">Servings</span>
              <input type="number" min={1} max={100} value={draft.servings}
                onChange={(e) => set({ servings: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)) })}
                className={`${smallInput} w-full`} />
            </label>
            <label className="block">
              <span className="block text-[11px] text-neutral-500 mb-0.5">Minutes</span>
              <input type="number" min={1} max={10000} value={draft.prepTimeMinutes ?? ''}
                onChange={(e) => set({ prepTimeMinutes: parseInt(e.target.value, 10) || null })}
                className={`${smallInput} w-full`} />
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-neutral-600 flex-wrap">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={draft.isKidFriendly} onChange={(e) => set({ isKidFriendly: e.target.checked })} /> Kid-friendly
        </label>
        {draft.calories != null && <span>{draft.calories} cal{draft.proteinG != null ? ` · P ${draft.proteinG}g` : ''} per serving (from the site)</span>}
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 mb-1.5">Ingredients ({draft.ingredients.length})</p>
        <div className="space-y-1.5">
          {draft.ingredients.map((ing, i) => (
            <div key={i} className="flex gap-1.5 items-center" title={ing.original ? `Original: ${ing.original}` : undefined}>
              <input type="number" step="any" min={0} value={ing.quantity ?? ''} placeholder="qty"
                onChange={(e) => setIng(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                className={`${smallInput} w-16`} aria-label="Quantity" />
              <input value={ing.unit ?? ''} placeholder="unit" maxLength={40}
                onChange={(e) => setIng(i, { unit: e.target.value || null })}
                className={`${smallInput} w-16`} aria-label="Unit" />
              <input value={ing.name} maxLength={200}
                onChange={(e) => setIng(i, { name: e.target.value })}
                className={`${smallInput} flex-1 min-w-0`} aria-label="Ingredient" />
              <button onClick={() => set({ ingredients: draft.ingredients.filter((_, j) => j !== i) })}
                className="p-1 text-neutral-400 hover:text-danger-600" aria-label="Remove ingredient">
                <IconTrash size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => set({ ingredients: [...draft.ingredients, { name: '', quantity: null, unit: null }] })}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
          >
            <IconPlus size={13} /> Add ingredient
          </button>
        </div>
      </div>

      <label className="block">
        <span className="block text-sm font-medium text-neutral-700 mb-1.5">Instructions</span>
        <textarea value={draft.instructions ?? ''} onChange={(e) => set({ instructions: e.target.value })} rows={6} className={`${inputClass} text-xs`} />
      </label>
    </div>
  );
}

/**
 * Import a recipe from a link, pasted text, or bookmarklet data; review it; save it
 * and (optionally) put it on the plan. With `planTarget` the slot is fixed (meal picker).
 */
export default function ImportRecipeModal({ isOpen, onClose, initialPayload = null, planTarget = null }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null); // { method, existingRecipeId }
  const [draft, setDraft] = useState(null);
  const [addToPlan, setAddToPlan] = useState(!!planTarget);
  const [planDate, setPlanDate] = useState(formatDate(new Date()));
  const [planSlot, setPlanSlot] = useState('DINNER');

  const reset = () => {
    setResult(null); setDraft(null); setUrl(''); setText(''); setMode('url');
    previewMutation.reset();
  };
  const close = () => { reset(); onClose(); };

  const previewMutation = useMutation({
    mutationFn: (payload) => previewWebRecipe(payload),
    onSuccess: (data) => {
      setResult({ method: data.method, existingRecipeId: data.existingRecipeId });
      setDraft(data.recipe);
      if (data.recipe.mealType !== 'SNACK') setPlanSlot(data.recipe.mealType);
    },
  });
  const elapsed = useElapsed(previewMutation.isPending);

  // Bookmarklet / share data arrives already filled in: read it straight away.
  useEffect(() => {
    if (isOpen && initialPayload) {
      if (initialPayload.pageUrl) setUrl(initialPayload.pageUrl);
      previewMutation.mutate(initialPayload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPayload]);

  const assign = async (recipeId) => {
    if (planTarget) {
      await updateMealPlanMeals(planTarget.mealPlanId, { dayOfWeek: planTarget.dayOfWeek, mealType: planTarget.mealType, recipeId });
      return;
    }
    const week = await getMealPlanWeek(planDate);
    const dayOfWeek = UTC_DAYS[new Date(`${planDate}T00:00:00Z`).getUTCDay()];
    await updateMealPlanMeals(week.id, { dayOfWeek, mealType: planSlot, recipeId });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ useExisting }) => {
      let recipeId = result.existingRecipeId;
      if (!useExisting) {
        const ingredients = draft.ingredients
          .filter((i) => i.name.trim())
          .map(({ name, quantity, unit, isOptional }) => ({
            name: name.trim(), quantity: quantity > 0 ? quantity : null, unit: unit?.trim() || null, isOptional: !!isOptional,
          }));
        const saved = await createRecipe({
          name: draft.name.trim(),
          description: draft.description,
          mealType: draft.mealType,
          servings: draft.servings,
          prepTimeMinutes: draft.prepTimeMinutes,
          calories: draft.calories, proteinG: draft.proteinG, carbsG: draft.carbsG, fatG: draft.fatG,
          isKidFriendly: draft.isKidFriendly,
          tags: draft.tags,
          instructions: draft.instructions?.trim() || null,
          imageUrl: draft.imageUrl,
          sourceUrl: draft.sourceUrl,
          source: 'WEB',
          ingredients,
        });
        recipeId = saved.id;
      }
      if (addToPlan) await assign(recipeId);
      return { planned: addToPlan };
    },
    onSuccess: ({ planned }) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      if (planned) {
        queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
        queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
      }
      toast.success(planned ? 'Recipe saved and added to your plan' : 'Recipe saved to your library');
      close();
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'url' && url.trim()) previewMutation.mutate({ url: url.trim() });
    if (mode === 'text' && text.trim().length >= 20) previewMutation.mutate({ text: text.trim() });
  };

  const error = previewMutation.error;
  const blocked = /blocks automatic imports/i.test(error?.message ?? '');
  const canSave = draft?.name.trim() && draft.ingredients.some((i) => i.name.trim());

  return (
    <BottomSheet wide isOpen={isOpen} onClose={close} title="Import a recipe">
      {!draft ? (
        <div className="space-y-4">
          <div className="inline-flex p-0.5 bg-neutral-100 rounded-lg">
            {[{ id: 'url', label: 'Link', Icon: IconLink }, { id: 'text', label: 'Paste text', Icon: IconClipboardText }].map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'url' ? (
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required autoFocus
                placeholder="https://www.example.com/best-chicken-tacos" className={inputClass} />
            ) : (
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} autoFocus maxLength={30000}
                placeholder="Paste the recipe: title, ingredients and steps. Extra text from the page is fine; your AI picks out the recipe."
                className={`${inputClass} text-xs`} />
            )}
            <button type="submit" disabled={previewMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {previewMutation.isPending && <IconLoader2 size={16} className="animate-spin" />}
              {previewMutation.isPending ? `Reading recipe… ${elapsed}s` : 'Get recipe'}
            </button>
            {previewMutation.isPending && elapsed >= 3 && (
              <p className="text-xs text-neutral-500 text-center">
                {mode === 'text' || initialPayload?.text ? 'Your AI is reading the recipe (usually 10–40s)…' : 'No quick recipe data found, so your AI is reading the page (usually 10–40s)…'}
              </p>
            )}
          </form>

          {error && !previewMutation.isPending && (
            <div className="flex gap-2 text-sm bg-danger-50 border border-danger-100 text-danger-700 rounded-lg p-3">
              <IconAlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{error.message}.</p>
                {blocked && (
                  <p className="text-xs">
                    Use the <strong>Save to NutriLabs</strong> bookmark on that page, or{' '}
                    <button onClick={() => { setMode('text'); previewMutation.reset(); }} className="underline font-medium">paste the recipe text</button>.
                  </p>
                )}
              </div>
            </div>
          )}

          <BookmarkletHelp />
        </div>
      ) : (
        <div className="space-y-4">
          <p className={`text-xs rounded-lg px-3 py-2 ${METHOD_NOTE[result.method]?.warn ? 'bg-accent-50 text-accent-900' : 'bg-primary-50 text-primary-900'}`}>
            {METHOD_NOTE[result.method]?.text}{' '}
            {draft.sourceUrl && <span className="text-neutral-500 break-all">{new URL(draft.sourceUrl).hostname}</span>}
          </p>

          {result.existingRecipeId && (
            <p className="text-xs bg-neutral-50 text-neutral-600 rounded-lg px-3 py-2">
              You already imported this page. You can add the saved copy to your plan instead of making a duplicate.
            </p>
          )}

          <RecipeEditor draft={draft} setDraft={setDraft} />

          <div className="bg-neutral-50 rounded-xl p-3 space-y-2">
            {planTarget ? (
              <p className="text-xs text-neutral-600">This recipe will go into the meal slot you picked.</p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm text-neutral-700 font-medium">
                  <input type="checkbox" checked={addToPlan} onChange={(e) => setAddToPlan(e.target.checked)} />
                  Also add it to my meal plan
                </label>
                {addToPlan && (
                  <div className="flex gap-2">
                    <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className={`${smallInput} flex-1`} required />
                    <select value={planSlot} onChange={(e) => setPlanSlot(e.target.value)} className={`${smallInput} flex-1`}>
                      {PLAN_SLOTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={reset} className="px-4 py-2.5 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50">
              Back
            </button>
            {result.existingRecipeId && addToPlan && (
              <button onClick={() => saveMutation.mutate({ useExisting: true })} disabled={saveMutation.isPending}
                className="flex-1 py-2.5 text-sm font-semibold text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 disabled:opacity-50">
                Use saved copy
              </button>
            )}
            <button onClick={() => saveMutation.mutate({ useExisting: false })} disabled={!canSave || saveMutation.isPending || (addToPlan && !planTarget && !planDate)}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving…' : addToPlan ? 'Save & add to plan' : 'Save to library'}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
