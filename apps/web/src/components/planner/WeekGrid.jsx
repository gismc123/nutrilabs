import { Fragment } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import HouseholdBadge from '../ui/HouseholdBadge.jsx';
import MealSlot from './MealSlot.jsx';
import { updateMealPlanDayConfig } from '../../api/client.js';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_SHORT = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'];
const MEAL_SHORT = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };

export default function WeekGrid({ mealPlanId, grid, weekStart, profiles = [] }) {
  const queryClient = useQueryClient();

  const toggleModeMutation = useMutation({
    mutationFn: ({ dayOfWeek, householdMode }) =>
      updateMealPlanDayConfig(mealPlanId, {
        dayOfWeek,
        householdMode: householdMode === 'SOLO' ? 'DAD_MODE' : 'SOLO',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealplan-week'] }),
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `80px repeat(7, 1fr)` }}>
        {/* Header row */}
        <div />
        {DAYS.map((day, idx) => {
          const date = weekStart ? new Date(weekStart) : null;
          if (date) date.setUTCDate(date.getUTCDate() + idx);
          const dateNum = date ? date.getUTCDate() : null;
          const dayData = grid?.[day];
          const mode = dayData?.householdMode ?? 'SOLO';

          return (
            <div key={day} className="px-1 pb-2 text-center">
              <p className="text-xs font-semibold text-neutral-500 uppercase">{DAY_SHORT[day]}</p>
              {dateNum && <p className="text-lg font-bold text-neutral-800">{dateNum}</p>}
              <HouseholdBadge
                mode={mode}
                profiles={profiles}
                onToggle={() => toggleModeMutation.mutate({ dayOfWeek: day, householdMode: mode })}
              />
            </div>
          );
        })}

        {/* Meal rows */}
        {MEAL_TYPES.map((mealType) => (
          <Fragment key={mealType}>
            <div className="pr-2 py-1 flex items-center">
              <span className="text-xs font-medium text-neutral-400">{MEAL_SHORT[mealType]}</span>
            </div>
            {DAYS.map((day) => {
              const dayData = grid?.[day];
              const plannedMeal = dayData?.meals?.[mealType] ?? null;

              return (
                <div key={`${day}-${mealType}`} className="px-1 py-1">
                  <MealSlot
                    mealPlanId={mealPlanId}
                    dayOfWeek={day}
                    mealType={mealType}
                    plannedMeal={plannedMeal}
                    dayHouseholdMode={dayData?.householdMode ?? 'SOLO'}
                  />
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
