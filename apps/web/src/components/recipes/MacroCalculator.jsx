import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconCalculator, IconAlertTriangle, IconRefresh, IconSearch, IconLoader } from '@tabler/icons-react';
import {
  calculateMacros, getFoodCandidates, chooseFoodMatch, setFoodUnitGrams, resetFoodMatch, estimateMacros,
} from '../../api/client.js';

const MACRO_KEYS = ['calories', 'proteinG', 'carbsG', 'fatG'];

/** Form ingredient rows → what the calculator API expects (whole-recipe amounts). */
function toPayload(ingredients) {
  return ingredients
    .filter((i) => i.name?.trim())
    .map((i) => {
      const q = parseFloat(i.quantity);
      return { name: i.name.trim(), quantity: q > 0 ? q : null, unit: i.unit?.trim() || null, isOptional: !!i.isOptional };
    });
}

function lineText(row) {
  const q = row.quantity != null ? `${Math.round(row.quantity * 100) / 100} ` : '';
  return `${q}${row.unit ? `${row.unit} ` : ''}${row.name}`;
}

function MacroSummary({ perServing, servings }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {[
        ['Cal', perServing.calories, ''],
        ['Protein', perServing.proteinG, 'g'],
        ['Carbs', perServing.carbsG, 'g'],
        ['Fat', perServing.fatG, 'g'],
      ].map(([label, value, unit]) => (
        <div key={label} className="bg-white rounded-lg py-2">
          <p className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</p>
          <p className="text-sm font-bold text-neutral-800">{value}{unit}</p>
        </div>
      ))}
      <p className="col-span-4 text-[11px] text-neutral-500">per serving · recipe makes {servings}</p>
    </div>
  );
}

function FoodPicker({ row, onDone }) {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isFetching, error } = useQuery({
    queryKey: ['food-candidates', row.name, submitted],
    queryFn: () => getFoodCandidates(row.name, submitted || undefined),
    staleTime: 10 * 60 * 1000,
  });

  const choose = useMutation({
    mutationFn: (fdcId) => chooseFoodMatch(row.name, fdcId),
    onSuccess: onDone,
    onError: (err) => toast.error(err.message),
  });
  const reset = useMutation({
    mutationFn: () => resetFoodMatch(row.name),
    onSuccess: onDone,
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mt-2 p-2 bg-white border border-neutral-200 rounded-lg space-y-2">
      {/* Not a <form>: this sits inside the recipe form, where Enter would save the recipe. */}
      <div className="flex gap-1.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setSubmitted(search.trim()); } }}
          placeholder={`Search USDA (default: "${data?.key ?? row.key}")`}
          className="flex-1 px-2 py-1 border border-neutral-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <button type="button" onClick={() => setSubmitted(search.trim())} className="px-2 text-neutral-500 hover:text-neutral-800" title="Search">
          <IconSearch size={14} />
        </button>
      </div>

      {isFetching && <p className="text-xs text-neutral-400">Searching USDA…</p>}
      {error && <p className="text-xs text-danger-600">{error.message}</p>}
      {!isFetching && data?.candidates?.length === 0 && <p className="text-xs text-neutral-400">No USDA foods found — try other words.</p>}

      <ul className="max-h-56 overflow-y-auto divide-y divide-neutral-100">
        {data?.candidates?.map((c) => (
          <li key={c.fdcId}>
            <button
              type="button"
              disabled={choose.isPending}
              onClick={() => choose.mutate(c.fdcId)}
              className={`w-full text-left px-1.5 py-1.5 text-xs hover:bg-primary-50 disabled:opacity-50 ${row.food?.fdcId === c.fdcId ? 'bg-primary-50' : ''}`}
            >
              <span className="text-neutral-800">{c.description}</span>
              <span className="block text-[11px] text-neutral-400">
                {c.per100g ? `${Math.round(c.per100g.calories)} kcal · P ${c.per100g.proteinG} · C ${c.per100g.carbsG} · F ${c.per100g.fatG} per 100 g` : 'no macro data'}
                {c.dataType === 'SR Legacy' ? ' · has cup/piece sizes' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3 pt-1 text-xs">
        <button type="button" onClick={() => choose.mutate(null)} className="text-neutral-500 hover:text-neutral-800">
          Don&apos;t count this ingredient
        </button>
        {data?.current?.isUserChoice && (
          <button type="button" onClick={() => reset.mutate()} className="text-neutral-500 hover:text-neutral-800">
            Reset to automatic match
          </button>
        )}
        <button type="button" onClick={() => onDone(false)} className="ml-auto text-neutral-500 hover:text-neutral-800">
          Close
        </button>
      </div>
    </div>
  );
}

function GramsInput({ row, onDone }) {
  const [grams, setGrams] = useState('');
  const save = useMutation({
    mutationFn: () => setFoodUnitGrams(row.name, row.countUnit === 'each' ? null : row.countUnit, parseFloat(grams)),
    onSuccess: onDone,
    onError: (err) => toast.error(err.message),
  });
  const label = row.countUnit === 'each' ? `one ${row.key}` : `1 ${row.countUnit}`;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
      <span className="text-neutral-600">USDA has no size for {label}. It weighs</span>
      <input
        type="number" min="0" step="any" value={grams}
        onChange={(e) => setGrams(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (parseFloat(grams) > 0) save.mutate(); } }}
        className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
      <span className="text-neutral-600">g</span>
      <button
        type="button"
        disabled={!(parseFloat(grams) > 0) || save.isPending}
        onClick={() => save.mutate()}
        className="px-2 py-1 font-medium text-primary-600 hover:text-primary-900 disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function BreakdownRow({ row, onChanged }) {
  const [picking, setPicking] = useState(false);
  const done = (changed = true) => {
    setPicking(false);
    if (changed) onChanged();
  };

  const muted = ['optional', 'no-quantity', 'skipped'].includes(row.status);
  const needsAttention = ['no-match', 'no-grams', 'error'].includes(row.status);
  const reason = {
    optional: 'optional, not counted',
    'no-quantity': 'no amount, not counted',
    skipped: 'not counted (your choice)',
    'no-match': 'no confident USDA match',
    'no-grams': null,
    error: row.message,
  }[row.status];

  return (
    <li className={`py-2 ${muted ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        {needsAttention && <IconAlertTriangle size={14} className="text-accent-600 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-neutral-800">{lineText(row)}</p>
          {row.food?.description && row.status !== 'skipped' && (
            <p className="text-[11px] text-neutral-500 truncate" title={row.food.description}>
              {row.food.isUserChoice ? 'Your match: ' : ''}{row.food.description}
            </p>
          )}
          {row.status === 'ok' && (
            <p className={`text-[11px] ${row.estimated ? 'text-accent-600' : 'text-neutral-400'}`}>
              {row.grams} g · {row.how}{row.estimated ? ' — estimate' : ''}
            </p>
          )}
          {reason && <p className={`text-[11px] ${needsAttention ? 'text-accent-600' : 'text-neutral-400'}`}>{reason}</p>}
          {row.status === 'no-grams' && <GramsInput row={row} onDone={done} />}
        </div>
        <div className="text-right shrink-0">
          {row.status === 'ok' && <p className="text-xs font-semibold text-neutral-700">{row.macros.calories} kcal</p>}
          {!['optional', 'no-quantity'].includes(row.status) && (
            <button type="button" onClick={() => setPicking((v) => !v)} className="text-[11px] font-medium text-primary-600 hover:text-primary-900">
              {row.status === 'no-match' ? 'Pick food' : 'Change'}
            </button>
          )}
        </div>
      </div>
      {picking && <FoodPicker row={row} onDone={done} />}
    </li>
  );
}

export default function MacroCalculator({ ingredients, servings, recipeName, ollamaConnected, onApply }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [aiExtra, setAiExtra] = useState(null);
  const [snapshot, setSnapshot] = useState('');

  const payload = toPayload(ingredients);
  const servingCount = Math.max(1, parseInt(servings) || 1);
  const current = JSON.stringify([payload, servingCount]);
  const stale = result && snapshot !== current;

  const calc = useMutation({
    mutationFn: () => calculateMacros({ servings: servingCount, ingredients: payload }),
    onSuccess: (data) => {
      setResult(data);
      setAiExtra(null);
      setSnapshot(current);
    },
    onError: (err) => toast.error(err.message),
  });

  const unresolvedRows = result?.rows.filter((r) => ['no-match', 'no-grams', 'error'].includes(r.status)) ?? [];

  const ai = useMutation({
    // servings: 1 → the model returns the total for just these lines.
    mutationFn: () => estimateMacros({ recipeName: recipeName || 'Recipe', ingredients: unresolvedRows.map(lineText), servings: 1 }),
    onSuccess: (data) => setAiExtra({
      calories: Number(data.calories) || 0,
      proteinG: Number(data.proteinG) || 0,
      carbsG: Number(data.carbsG) || 0,
      fatG: Number(data.fatG) || 0,
      count: unresolvedRows.length,
    }),
    onError: (err) => toast.error(err.message ?? 'AI estimate failed'),
  });

  // Ingredients edited elsewhere in the form make an AI add-on meaningless.
  useEffect(() => { if (stale) setAiExtra(null); }, [stale]);

  const perServing = result && Object.fromEntries(MACRO_KEYS.map((k) => [
    k, Math.round((result.total[k] + (aiExtra?.[k] ?? 0)) / result.servings),
  ]));

  const run = () => {
    if (!payload.length) {
      toast.error('Add at least one ingredient first');
      return;
    }
    setOpen(true);
    calc.mutate();
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={calc.isPending}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-100 rounded-lg hover:bg-primary-100 disabled:opacity-60 transition-colors"
      >
        {calc.isPending ? <IconLoader size={14} className="animate-spin" /> : <IconCalculator size={14} />}
        {calc.isPending ? 'Looking up USDA data…' : result ? 'Recalculate from ingredients' : 'Calculate from ingredients (USDA)'}
      </button>

      {open && result && (
        <div className="bg-neutral-50 rounded-xl p-3 space-y-3">
          {stale && (
            <button type="button" onClick={run} className="w-full flex items-center justify-center gap-1 text-xs text-accent-900 bg-accent-100 rounded-lg py-1.5">
              <IconRefresh size={12} /> Ingredients or servings changed — recalculate
            </button>
          )}

          <MacroSummary perServing={perServing} servings={result.servings} />

          <p className="text-[11px] text-neutral-500">
            {result.counted} ingredient{result.counted === 1 ? '' : 's'} counted
            {result.unresolved > 0 && <span className="text-accent-600"> · {result.unresolved} need{result.unresolved === 1 ? 's' : ''} attention</span>}
            {aiExtra && <span> · +{Math.round(aiExtra.calories)} kcal AI estimate for {aiExtra.count} unmatched</span>}
          </p>

          <ul className="divide-y divide-neutral-200">
            {result.rows.map((row, i) => <BreakdownRow key={`${row.name}-${i}`} row={row} onChanged={() => calc.mutate()} />)}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { onApply(perServing); toast.success('Macros filled in — save the recipe to keep them'); }}
              disabled={stale}
              className="flex-1 py-2 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              Use these macros
            </button>
            {unresolvedRows.length > 0 && !aiExtra && ollamaConnected && (
              <button
                type="button"
                onClick={() => ai.mutate()}
                disabled={ai.isPending || stale}
                className="flex-1 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors"
              >
                {ai.isPending ? 'Asking AI…' : `Estimate ${unresolvedRows.length} unmatched with AI`}
              </button>
            )}
          </div>
          {result.unresolved > 0 && !aiExtra && (
            <p className="text-[11px] text-neutral-400">
              Unmatched ingredients aren&apos;t in the totals yet. Pick a USDA food for them{ollamaConnected ? ', or let AI estimate just those lines' : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
