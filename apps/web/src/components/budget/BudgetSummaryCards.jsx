import { IconTrophy, IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { centsToDisplay } from '../../utils/currency.js';

function StatCard({ label, value, icon, colorClass }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4">
      <p className="text-xs text-neutral-500 font-medium">{label}</p>
      <div className={`flex items-center gap-1.5 mt-1 ${colorClass ?? 'text-neutral-900'}`}>
        {icon}
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

export default function BudgetSummaryCards({ summary }) {
  const { thisMonth, lastMonth, allTime } = summary ?? {};

  const eatOutDelta = (thisMonth?.eatingOutSpend ?? 0) - (lastMonth?.eatingOutSpend ?? 0);
  const deltaDown = eatOutDelta < 0;
  const deltaDisplay = `${deltaDown ? '-' : '+'}${centsToDisplay(Math.abs(eatOutDelta))}`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="This month — groceries"
        value={centsToDisplay(thisMonth?.grocerySpend ?? 0)}
      />
      <StatCard
        label="This month — eating out"
        value={centsToDisplay(thisMonth?.eatingOutSpend ?? 0)}
      />
      <StatCard
        label="vs. last month"
        value={deltaDisplay}
        icon={deltaDown
          ? <IconArrowDown size={18} className="text-primary-600" />
          : <IconArrowUp size={18} className="text-danger-500" />}
        colorClass={deltaDown ? 'text-primary-600' : 'text-danger-600'}
      />
      <StatCard
        label="Total saved"
        value={centsToDisplay(allTime?.totalSaved ?? 0)}
        icon={<IconTrophy size={18} className="text-accent-600" />}
        colorClass="text-accent-600"
      />
    </div>
  );
}
