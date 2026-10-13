import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IconX } from '@tabler/icons-react';
import { getMealPlanWeek } from '../api/client.js';
import { useProfiles } from '../hooks/useProfiles.js';
import { formatDate, parseIsoDate, addDaysIso } from '../utils/dates.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import { SkeletonGrid } from '../components/ui/Skeleton.jsx';
import WeekNav from '../components/planner/WeekNav.jsx';
import WeekGrid from '../components/planner/WeekGrid.jsx';
import DayScroll from '../components/planner/DayScroll.jsx';


function WeekPlannerContent() {
  const { profiles } = useProfiles();

  // Any date inside the week being viewed. The server snaps it to the user's
  // week start, so the planner and grocery list always agree on the week.
  const [anchorDate, setAnchorDate] = useState(() => formatDate(new Date()));
  const [newWeekBanner, setNewWeekBanner] = useState(false);

  const prevAnchorDate = addDaysIso(anchorDate, -7);

  const { data: weekPlan, isLoading } = useQuery({
    queryKey: ['mealplan-week', anchorDate],
    queryFn: () => getMealPlanWeek(anchorDate),
  });

  const currentWeekStart = weekPlan ? parseIsoDate(weekPlan.weekStartDate) : null;

  useEffect(() => {
    if (weekPlan?.wasCreated) setNewWeekBanner(true);
  }, [weekPlan?.wasCreated]);

  const { data: prevWeekPlan } = useQuery({
    queryKey: ['mealplan-week', prevAnchorDate],
    queryFn: () => getMealPlanWeek(prevAnchorDate),
    staleTime: 5 * 60 * 1000,
  });

  const goToPrev = () => setAnchorDate((d) => addDaysIso(d, -7));
  const goToNext = () => setAnchorDate((d) => addDaysIso(d, 7));
  const goToDate = (dateStr) => setAnchorDate(dateStr);

  return (
    <div className="space-y-5">
      {newWeekBanner && (
        <div className="flex items-center justify-between bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
          <p className="text-sm text-primary-700">New week created from your custody template.</p>
          <button onClick={() => setNewWeekBanner(false)} className="text-primary-400 hover:text-primary-700">
            <IconX size={16} />
          </button>
        </div>
      )}

      <WeekNav
        weekStart={currentWeekStart}
        onPrev={goToPrev}
        onNext={goToNext}
        onJump={goToDate}
        mealPlanId={weekPlan?.id}
        prevMealPlanId={prevWeekPlan?.id}
      />

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <WeekGrid
              mealPlanId={weekPlan?.id}
              grid={weekPlan?.grid}
              weekStart={currentWeekStart}
              profiles={profiles}
            />
          </div>

          {/* Mobile */}
          <div className="md:hidden">
            <DayScroll mealPlanId={weekPlan?.id} grid={weekPlan?.grid} weekStart={currentWeekStart} />
          </div>
        </>
      )}
    </div>
  );
}

export default function WeekPlanner() {
  useEffect(() => { document.title = 'NutriLabs — Week Planner'; }, []);
  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6">
        <WeekPlannerContent />
      </div>
    </ErrorBoundary>
  );
}
