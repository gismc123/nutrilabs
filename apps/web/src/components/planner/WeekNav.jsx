import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useUiStore } from '../../store/uiStore.js';
import AIFillWeekButton from './AIFillWeekButton.jsx';
import { copyMealPlan, clearMealPlanMeals } from '../../api/client.js';
import { formatDate } from '../../utils/dates.js';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${MONTH_ABBR[start.getUTCMonth()]} ${start.getUTCDate()} – ${MONTH_ABBR[end.getUTCMonth()]} ${end.getUTCDate()}`;
}

export default function WeekNav({
  weekStart,
  onPrev,
  onNext,
  onJump,
  mealPlanId,
  prevMealPlanId,
}) {
  const dateInputRef = useRef(null);
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);

  const copyMutation = useMutation({
    mutationFn: () => copyMealPlan(mealPlanId, prevMealPlanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      toast.success('Last week copied');
    },
    onError: (err) => toast.error(err.message),
  });

  const clearMutation = useMutation({
    mutationFn: () => clearMealPlanMeals(mealPlanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      toast.success('Week cleared');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleClear = () => {
    showConfirm(
      'Clear week?',
      'This will remove all recipe assignments for the week.',
      () => clearMutation.mutate()
    );
  };

  const handleDateChange = (e) => {
    if (e.target.value) onJump(e.target.value);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-600 transition-colors">
          <IconChevronLeft size={20} />
        </button>

        <button
          onClick={() => dateInputRef.current?.showPicker?.()}
          className="flex-1 text-center text-sm font-semibold text-neutral-800 hover:text-primary-600 transition-colors"
        >
          {weekStart ? formatWeekRange(weekStart) : '—'}
        </button>
        <input
          ref={dateInputRef}
          type="date"
          className="sr-only"
          onChange={handleDateChange}
          value={weekStart ? formatDate(new Date(weekStart)) : ''}
        />

        <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-600 transition-colors">
          <IconChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <AIFillWeekButton mealPlanId={mealPlanId} />

        {prevMealPlanId && (
          <button
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors"
          >
            Copy last week
          </button>
        )}

        <button
          onClick={handleClear}
          disabled={clearMutation.isPending}
          className="px-3 py-1.5 text-xs font-medium text-danger-600 border border-danger-200 rounded-lg hover:bg-danger-50 disabled:opacity-50 transition-colors"
        >
          Clear week
        </button>
      </div>
    </div>
  );
}
