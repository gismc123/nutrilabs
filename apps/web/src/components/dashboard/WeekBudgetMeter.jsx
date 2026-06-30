import { centsToDisplay } from '../../utils/currency.js';

export default function WeekBudgetMeter({ weekBudget }) {
  if (!weekBudget) return null;

  const { grocerySpend, weeklyBudget, mealsCooked, mealsEatenOut } = weekBudget;
  const pct = weeklyBudget > 0 ? Math.min(100, Math.round((grocerySpend / weeklyBudget) * 100)) : 0;

  let barColor = 'bg-primary-600';
  if (pct >= 90) barColor = 'bg-danger-500';
  else if (pct >= 70) barColor = 'bg-accent-600';

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4 space-y-3">
      <p className="text-sm font-semibold text-neutral-700">Weekly grocery budget</p>
      <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden">
        <div
          className={`${barColor} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{centsToDisplay(grocerySpend)} spent of {centsToDisplay(weeklyBudget)} budget</span>
        <span>{pct}%</span>
      </div>
      <p className="text-xs text-neutral-400">
        {mealsCooked} meal{mealsCooked !== 1 ? 's' : ''} cooked · {mealsEatenOut} eaten out this week
      </p>
    </div>
  );
}
