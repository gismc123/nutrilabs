import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBudgetSummary, getBudgetWeekly } from '../api/client.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import BudgetSummaryCards from '../components/budget/BudgetSummaryCards.jsx';
import WeeklyTrendChart from '../components/budget/WeeklyTrendChart.jsx';
import AIInsightBanner from '../components/budget/AIInsightBanner.jsx';
import EatOutLogTable from '../components/budget/EatOutLogTable.jsx';
import LogEatOutFAB, { LogEatOutButton } from '../components/budget/LogEatOutFAB.jsx';

function BudgetContent() {
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['budget-summary'],
    queryFn: getBudgetSummary,
  });

  const { data: weeklyData, isLoading: loadingWeekly } = useQuery({
    queryKey: ['budget-weekly'],
    queryFn: getBudgetWeekly,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Budget Tracker</h1>
        <LogEatOutButton />
      </div>

      {loadingSummary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <BudgetSummaryCards summary={summary} />
      )}

      <AIInsightBanner />

      <WeeklyTrendChart weeklyData={weeklyData} isLoading={loadingWeekly} />

      <EatOutLogTable />

      <LogEatOutFAB />
    </div>
  );
}

export default function BudgetTracker() {
  useEffect(() => {
    document.title = 'NutriLabs — Budget Tracker';
  }, []);

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <BudgetContent />
      </div>
    </ErrorBoundary>
  );
}
