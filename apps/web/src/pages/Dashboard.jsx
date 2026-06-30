import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMealPlanWeek, getBudgetWeek, getBudgetSummary } from '../api/client.js';
import { useSettings } from '../hooks/useSettings.js';
import { useProfiles } from '../hooks/useProfiles.js';
import { formatDate } from '../utils/dates.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import Skeleton, { SkeletonCard } from '../components/ui/Skeleton.jsx';
import TodayHeader from '../components/dashboard/TodayHeader.jsx';
import TodayMeals from '../components/dashboard/TodayMeals.jsx';
import PrepDayBanner from '../components/dashboard/PrepDayBanner.jsx';
import WeekBudgetMeter from '../components/dashboard/WeekBudgetMeter.jsx';
import SavingsCallout from '../components/dashboard/SavingsCallout.jsx';

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton height="2rem" width="60%" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

function DashboardContent() {
  const today = formatDate(new Date());
  const { settings } = useSettings();
  const { profiles } = useProfiles();

  const { data: weekPlan, isLoading: loadingPlan } = useQuery({
    queryKey: ['mealplan-week', today],
    queryFn: () => getMealPlanWeek(today),
  });

  const { data: weekBudget, isLoading: loadingBudget } = useQuery({
    queryKey: ['budget-week'],
    queryFn: getBudgetWeek,
  });

  const { data: budgetSummary } = useQuery({
    queryKey: ['budget-summary'],
    queryFn: getBudgetSummary,
  });

  if (loadingPlan || loadingBudget) return <DashboardSkeleton />;

  const grid = weekPlan?.grid ?? {};
  const eatingOutReference = budgetSummary?.eatingOutReference ?? 1200;

  return (
    <div className="space-y-5">
      <TodayHeader grid={grid} profiles={profiles} />
      <TodayMeals mealPlanId={weekPlan?.id} grid={grid} />
      <PrepDayBanner settings={settings} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WeekBudgetMeter weekBudget={weekBudget} />
        <SavingsCallout weekBudget={weekBudget} eatingOutReference={eatingOutReference} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  useEffect(() => { document.title = 'NutriLabs — Dashboard'; }, []);
  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <DashboardContent />
      </div>
    </ErrorBoundary>
  );
}
