import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { addPantryItemToPlan, getMealPlanWeek } from '../../api/client.js';
import BottomSheet from '../ui/BottomSheet.jsx';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

function getISOMonday() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

export default function AddToPlanModal({ item, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [weekDate, setWeekDate] = useState(getISOMonday());
  const [dayOfWeek, setDayOfWeek] = useState('MON');
  const [mealType, setMealType] = useState('SNACK');

  const { data: mealPlan } = useQuery({
    queryKey: ['mealplan-week', weekDate],
    queryFn: () => getMealPlanWeek(weekDate),
    enabled: isOpen,
  });

  const mutation = useMutation({
    mutationFn: () => addPantryItemToPlan(item.id, {
      mealPlanId: mealPlan?.id,
      dayOfWeek,
      mealType,
    }),
    onSuccess: () => {
      toast.success('Added to your plan');
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Add to plan — ${item?.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Week</label>
          <input
            type="date"
            value={weekDate}
            onChange={(e) => setWeekDate(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Day</label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Meal</label>
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            {MEAL_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !mealPlan?.id}
          className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Adding…' : 'Add to plan'}
        </button>
      </div>
    </BottomSheet>
  );
}
