import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateMealPlanDayConfig } from '../../api/client.js';
import MealSlot from './MealSlot.jsx';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_SHORT = { MON: 'Mo', TUE: 'Tu', WED: 'We', THU: 'Th', FRI: 'Fr', SAT: 'Sa', SUN: 'Su' };
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'];
const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' };

const MODE_DOT = { SOLO: 'bg-neutral-300', DAD_MODE: 'bg-accent-400' };

export default function DayScroll({ mealPlanId, grid }) {
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
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

  const dayData = grid?.[selectedDay];
  const meals = dayData?.meals ?? {};

  return (
    <div className="space-y-4">
      {/* Day strip */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map((day) => {
          const mode = grid?.[day]?.householdMode ?? 'SOLO';
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[48px] transition-colors ${
                isSelected
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              <span className="text-xs font-semibold">{DAY_SHORT[day]}</span>
              <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/60' : MODE_DOT[mode]}`} />
            </button>
          );
        })}
      </div>

      {/* Selected day meals */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">{selectedDay}</h3>
        <button
          onClick={() =>
            toggleModeMutation.mutate({ dayOfWeek: selectedDay, householdMode: dayData?.householdMode ?? 'SOLO' })
          }
          className="text-xs text-neutral-500 underline"
        >
          Toggle {dayData?.householdMode === 'DAD_MODE' ? 'Solo' : 'Dad mode'}
        </button>
      </div>

      <div className="space-y-2">
        {MEAL_TYPES.map((mealType) => (
          <div key={mealType}>
            <p className="text-xs font-medium text-neutral-400 mb-1 uppercase">{MEAL_LABELS[mealType]}</p>
            <MealSlot
              mealPlanId={mealPlanId}
              dayOfWeek={selectedDay}
              mealType={mealType}
              plannedMeal={meals[mealType] ?? null}
              dayHouseholdMode={dayData?.householdMode ?? 'SOLO'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
