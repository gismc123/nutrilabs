import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IconX } from '@tabler/icons-react';
import { getMealPlanWeek } from '../api/client.js';
import { useSettings } from '../hooks/useSettings.js';
import { useProfiles } from '../hooks/useProfiles.js';
import { getWeekStart, formatDate } from '../utils/dates.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import { SkeletonGrid } from '../components/ui/Skeleton.jsx';
import WeekNav from '../components/planner/WeekNav.jsx';
import WeekGrid from '../components/planner/WeekGrid.jsx';
import DayScroll from '../components/planner/DayScroll.jsx';


function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function WeekPlannerContent() {
  const { settings } = useSettings();
  const { profiles } = useProfiles();
  const weekStartDay = settings?.weekStartDay ?? 'SUN';

  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    getWeekStart(new Date(), weekStartDay)
  );
  const [newWeekBanner, setNewWeekBanner] = useState(false);

  const weekDateStr = formatDate(currentWeekStart);
  const prevWeekDateStr = formatDate(addDays(currentWeekStart, -7));

  const { data: weekPlan, isLoading } = useQuery({
    queryKey: ['mealplan-week', weekDateStr],
    queryFn: () => getMealPlanWeek(weekDateStr),
  });

  useEffect(() => {
    if (weekPlan?.wasCreated) setNewWeekBanner(true);
  }, [weekPlan?.wasCreated]);

  const { data: prevWeekPlan } = useQuery({
    queryKey: ['mealplan-week', prevWeekDateStr],
    queryFn: () => getMealPlanWeek(prevWeekDateStr),
    staleTime: 5 * 60 * 1000,
  });

  const goToPrev = () => setCurrentWeekStart((d) => addDays(d, -7));
  const goToNext = () => setCurrentWeekStart((d) => addDays(d, 7));
  const goToDate = (dateStr) => setCurrentWeekStart(getWeekStart(new Date(dateStr), weekStartDay));

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
            <DayScroll mealPlanId={weekPlan?.id} grid={weekPlan?.grid} />
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
