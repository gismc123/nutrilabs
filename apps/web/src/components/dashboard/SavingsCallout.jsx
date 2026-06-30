import { centsToDisplay } from '../../utils/currency.js';

export default function SavingsCallout({ weekBudget, eatingOutReference }) {
  if (!weekBudget) return null;

  const { grocerySpend, mealsCooked } = weekBudget;
  const ref = eatingOutReference ?? 1200;
  const savings = Math.max(0, mealsCooked * ref - grocerySpend);

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4 space-y-1">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Estimated savings this week</p>
      {savings > 0 ? (
        <>
          <p className="text-2xl font-bold text-primary-600">{centsToDisplay(savings)}</p>
          <p className="text-xs text-neutral-400">
            Based on {mealsCooked} meal{mealsCooked !== 1 ? 's' : ''} cooked vs. {centsToDisplay(ref)} eating-out reference
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-500 italic">Cook a meal to start saving</p>
      )}
    </div>
  );
}
