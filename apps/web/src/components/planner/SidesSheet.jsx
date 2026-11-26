import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSearch, IconX, IconPlus } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import RecipeImage from '../recipes/RecipeImage.jsx';
import { getRecipes, addMealSide, deleteMealSide, searchMealDb, importMealDbRecipe } from '../../api/client.js';
import { centsToDisplay } from '../../utils/currency.js';

const MAX_SIDES = 6;

// One-tap sides with no recipe. Each goes on the grocery list as one item.
const QUICK_SIDES = ['Bagged salad', 'Broccoli', 'Green beans', 'Corn', 'Dinner rolls', 'Fruit', 'Baked potatoes', 'Rice'];

// Recipes that look like sides float to the top of "Your recipes".
const SIDE_WORDS = /\b(side|salad|slaw|rice|pilaf|beans|potato|potatoes|fries|mash|bread|rolls|biscuits|corn|broccoli|vegetables|veggies|asparagus|carrots|greens|couscous|quinoa|noodles)\b/i;
const looksLikeSide = (r) => r.tags?.some((t) => t.toLowerCase() === 'side') || SIDE_WORDS.test(r.name);

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Thumb({ src, alt }) {
  return (
    <div className="w-10 h-10 shrink-0 rounded-lg bg-neutral-100 overflow-hidden">
      <RecipeImage src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}

function ResultRow({ image, title, meta, onAdd, disabled, label = 'Add' }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-50">
      <Thumb src={image} alt={title} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800 truncate">{title}</p>
        {meta && <p className="text-xs text-neutral-400 truncate">{meta}</p>}
      </div>
      <button
        onClick={onAdd} disabled={disabled}
        className="shrink-0 flex items-center gap-1 px-3 min-h-9 text-xs font-medium text-primary-700 border border-primary-300 rounded-lg hover:bg-primary-50 disabled:opacity-40"
      >
        <IconPlus size={13} /> {label}
      </button>
    </div>
  );
}

function YourRecipes({ excludeIds, onAdd, busy }) {
  const [search, setSearch] = useState('');
  const { data: recipes = [], isLoading } = useQuery({ queryKey: ['recipes', {}], queryFn: () => getRecipes({}) });
  const q = search.trim().toLowerCase();
  const list = recipes
    .filter((r) => !excludeIds.has(r.id) && (!q || r.name.toLowerCase().includes(q) || r.tags?.some((t) => t.includes(q))))
    .sort((a, b) => Number(looksLikeSide(b)) - Number(looksLikeSide(a)) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-2">
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your recipes..." aria-label="Search your recipes"
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} height="2.5rem" />)}</div>
      ) : list.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-6">No recipes match. Try <strong>Find side recipes</strong>.</p>
      ) : (
        <div className="max-h-[38vh] overflow-y-auto">
          {list.map((r) => (
            <ResultRow
              key={r.id} image={r.imageUrl} title={r.name} disabled={busy}
              meta={[r.calories != null && `${r.calories} cal`, r.costPerServing != null && `${centsToDisplay(Math.round(r.costPerServing * 100))}/srv`].filter(Boolean).join(' · ')}
              onAdd={() => onAdd({ recipeId: r.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FindSides({ onAdd, busy }) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 400);
  const searching = debounced.length >= 2;
  const queryClient = useQueryClient();

  const results = useQuery({
    // Nothing typed: TheMealDB's whole "Side" category.
    queryKey: ['sides-mealdb', searching ? debounced : null],
    queryFn: () => searchMealDb(searching ? { query: debounced } : { category: 'Side' }),
    staleTime: 10 * 60 * 1000,
  });

  const importAndAdd = useMutation({
    mutationFn: async (item) => {
      const imported = await importMealDbRecipe(item.id, { mealType: 'DINNER' });
      await onAdd({ recipeId: imported.id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
    onError: (err) => toast.error(err.message),
  });

  const items = results.data?.results ?? [];
  return (
    <div className="space-y-2">
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search TheMealDB (mashed potatoes, coleslaw...)" aria-label="Search side recipes"
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>
      {!searching && <p className="text-xs text-neutral-400">Showing TheMealDB's side dishes. Type to search everything.</p>}
      {results.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} height="2.5rem" />)}</div>
      ) : results.isError ? (
        <p className="text-sm text-danger-600 text-center py-4">{results.error.message}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-6">No recipes found.</p>
      ) : (
        <div className="max-h-[38vh] overflow-y-auto">
          {items.map((m) => (
            <ResultRow
              key={m.id} image={m.image} title={m.title}
              meta={[m.category, m.cuisine, m.libraryRecipeId && 'in your library'].filter(Boolean).join(' · ')}
              disabled={busy || importAndAdd.isPending}
              label="Import & add"
              onAdd={() => importAndAdd.mutate(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = ['Quick sides', 'Your recipes', 'Find side recipes'];

export default function SidesSheet({ isOpen, onClose, mealPlanId, dayOfWeek, mealType, plannedMeal }) {
  const [tab, setTab] = useState(0);
  const [custom, setCustom] = useState('');
  const queryClient = useQueryClient();
  const sides = plannedMeal?.sides ?? [];
  const full = sides.length >= MAX_SIDES;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
    queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
  };

  const add = useMutation({
    mutationFn: (side) => addMealSide(mealPlanId, { dayOfWeek, mealType, ...side }),
    onSuccess: (side) => { refresh(); toast.success(`Added ${side.name}`); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (sideId) => deleteMealSide(mealPlanId, sideId),
    onSuccess: refresh,
    onError: (err) => toast.error(err.message),
  });

  const usedRecipeIds = new Set([plannedMeal?.recipeId, ...sides.map((s) => s.recipeId)].filter(Boolean));
  const usedNames = new Set(sides.filter((s) => !s.recipeId).map((s) => s.name.toLowerCase()));
  const busy = add.isPending || full;

  const submitCustom = (e) => {
    e.preventDefault();
    const name = custom.trim();
    if (!name) return;
    add.mutate({ name }, { onSuccess: () => setCustom('') });
  };

  return (
    <BottomSheet wide isOpen={isOpen} onClose={onClose} title={`Sides for ${plannedMeal?.recipe?.name ?? 'this meal'}`}>
      <div className="space-y-4">
        <section aria-label="Sides on this meal">
          {sides.length === 0 ? (
            <p className="text-sm text-neutral-500">No sides yet. Add as many as the meal needs, or none.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {sides.map((s) => (
                <li key={s.id} className="flex items-center gap-1 pl-3 pr-1 min-h-9 rounded-full bg-primary-50 text-primary-800 text-sm">
                  <span className="max-w-[14rem] truncate">{s.name}</span>
                  {!s.recipeId && <span className="text-xs text-primary-500">(item)</span>}
                  <button
                    onClick={() => remove.mutate(s.id)} disabled={remove.isPending}
                    aria-label={`Remove ${s.name}`}
                    className="ml-1 w-7 h-7 flex items-center justify-center rounded-full hover:bg-primary-100"
                  >
                    <IconX size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-neutral-400 mt-2">
            Sides are added to this week's grocery list. A side recipe adds its ingredients; a quick side adds one item.
            {full && ` This meal has the most sides allowed (${MAX_SIDES}).`}
          </p>
        </section>

        <div className="flex border-b border-neutral-100">
          {TABS.map((t, i) => (
            <button
              key={t} onClick={() => setTab(i)}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === i ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_SIDES.filter((n) => !usedNames.has(n.toLowerCase())).map((n) => (
                <button
                  key={n} onClick={() => add.mutate({ name: n })} disabled={busy}
                  className="flex items-center gap-1 px-3 min-h-9 rounded-full text-sm border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                >
                  <IconPlus size={13} /> {n}
                </button>
              ))}
            </div>
            <form onSubmit={submitCustom} className="flex gap-2">
              <input
                type="text" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={80}
                placeholder="Something else (frozen peas, garlic bread...)" aria-label="Add a quick side"
                className="flex-1 min-w-0 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button type="submit" disabled={busy || !custom.trim()} className="shrink-0 px-4 min-h-10 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-40">
                Add
              </button>
            </form>
          </div>
        )}
        {tab === 1 && <YourRecipes excludeIds={usedRecipeIds} busy={busy} onAdd={(s) => add.mutateAsync(s)} />}
        {tab === 2 && <FindSides busy={busy} onAdd={(s) => add.mutateAsync(s)} />}

        <button onClick={onClose} className="w-full min-h-10 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50">
          Done
        </button>
      </div>
    </BottomSheet>
  );
}
