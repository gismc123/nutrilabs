import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSparkles, IconCheck, IconAlertTriangle, IconLoader2, IconPlayerStop, IconX, IconRefresh } from '@tabler/icons-react';
import { aiFillDay } from '../../api/client.js';
import { orderedWeekDays } from '../../utils/dates.js';
import { useHealth } from '../../hooks/useHealth.js';

const DAY_NAMES = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
const SLOTS = ['BREAKFAST', 'LUNCH', 'DINNER'];
const SLOT_SHORT = { BREAKFAST: 'B', LUNCH: 'L', DINNER: 'D' };

function emptySlots(grid, day) {
  return SLOTS.filter((t) => !grid?.[day]?.meals?.[t]?.recipeId).length;
}

function useElapsed(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return secs;
}

/**
 * Fills the week's empty slots one day at a time. Each day is its own short AI
 * request (~10-25s), so the grid fills in live and nothing hits a proxy timeout.
 */
export default function AIFillWeekButton({ mealPlanId, weekStart, grid }) {
  const queryClient = useQueryClient();
  const { health } = useHealth();
  // days: [{ day, status: 'pending'|'running'|'done'|'skipped'|'failed'|'stopped', meals, error }]
  const [days, setDays] = useState(null);
  const [running, setRunning] = useState(false);
  const [targets, setTargets] = useState([]);
  const stopRef = useRef(false);
  const elapsed = useElapsed(running);

  const update = (day, patch) => setDays((prev) => prev.map((d) => (d.day === day ? { ...d, ...patch } : d)));

  const run = async (targetDays) => {
    stopRef.current = false;
    setTargets(targetDays);
    setRunning(true);
    const generated = [];
    let filledCount = 0;

    for (const day of targetDays) {
      if (stopRef.current) { update(day, { status: 'stopped' }); continue; }
      update(day, { status: 'running', error: null });

      let result = null;
      let lastError = null;
      for (let attempt = 0; attempt < 2 && !result && !stopRef.current; attempt++) {
        try {
          result = await aiFillDay(mealPlanId, { dayOfWeek: day, avoid: generated });
        } catch (err) {
          lastError = err;
          // Rate limits and missing plans won't fix themselves on a retry.
          if (/limit|not found/i.test(err.message)) break;
        }
      }

      if (result) {
        const names = result.meals.map((m) => m.name);
        generated.push(...names);
        filledCount += names.length;
        update(day, { status: names.length ? 'done' : 'skipped', meals: result.meals });
        // Show the new meals in the grid right away.
        queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
      } else if (stopRef.current) {
        update(day, { status: 'stopped' });
      } else {
        update(day, { status: 'failed', error: lastError?.message ?? 'Failed' });
        if (/limit/i.test(lastError?.message ?? '')) stopRef.current = true;
      }
    }

    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ['mealplan-week'] });
    queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    if (filledCount) toast.success(`AI planned ${filledCount} meal${filledCount === 1 ? '' : 's'}`);
  };

  const start = () => {
    const order = orderedWeekDays(weekStart);
    const todo = order.filter((d) => emptySlots(grid, d) > 0);
    if (!todo.length) {
      toast('Every slot is already planned — clear a day or the week to let AI fill it');
      return;
    }
    setDays(order.map((day) => ({ day, status: todo.includes(day) ? 'pending' : 'skipped', meals: [] })));
    run(todo);
  };

  const retryFailed = () => {
    const failed = days.filter((d) => d.status === 'failed' || d.status === 'stopped').map((d) => d.day);
    setDays((prev) => prev.map((d) => (failed.includes(d.day) ? { ...d, status: 'pending', error: null } : d)));
    run(failed);
  };

  const total = targets.length;
  const finished = days?.filter((d) => targets.includes(d.day) && !['pending', 'running'].includes(d.status)).length ?? 0;
  const current = days?.find((d) => d.status === 'running');
  const retryable = days?.some((d) => d.status === 'failed' || d.status === 'stopped');
  const aiOffline = health && !health.ollamaConnected;

  return (
    <>
      <button
        onClick={start}
        disabled={running || !mealPlanId || aiOffline}
        title={aiOffline ? 'AI unavailable — check the Ollama connection in Settings' : 'Fill empty slots with AI'}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
      >
        {running ? <IconLoader2 size={14} className="animate-spin" /> : <IconSparkles size={14} />}
        {running ? 'Planning…' : 'AI fill week'}
      </button>

      {days && (
        <div className="order-last basis-full bg-white border border-primary-100 rounded-xl p-3 space-y-3 shadow-sm" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900">
                {running
                  ? `Planning ${DAY_NAMES[current?.day] ?? '…'} (${Math.min(finished + 1, total)} of ${total})`
                  : retryable ? 'AI planning stopped' : 'AI planning finished'}
              </p>
              <p className="text-xs text-neutral-500">
                {running
                  ? `${elapsed}s · each day takes about 10–30 seconds on your AI server. Meals appear in the grid as each day finishes.`
                  : 'Only empty slots were filled. Click any meal to swap it.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {running && (
                <button
                  onClick={() => { stopRef.current = true; }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50"
                >
                  <IconPlayerStop size={13} /> Stop after this day
                </button>
              )}
              {!running && retryable && (
                <button
                  onClick={retryFailed}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50"
                >
                  <IconRefresh size={13} /> Retry the rest
                </button>
              )}
              {!running && (
                <button onClick={() => setDays(null)} aria-label="Dismiss" className="p-1 text-neutral-400 hover:text-neutral-700">
                  <IconX size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 transition-all duration-500"
              style={{ width: `${total ? Math.round(((finished + (running ? 0.5 : 0)) / total) * 100) : 100}%` }}
            />
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1.5">
            {days.map((d) => (
              <li key={d.day} className="flex items-start gap-1.5 text-xs min-w-0">
                <span className="mt-0.5 shrink-0">
                  {d.status === 'running' && <IconLoader2 size={13} className="animate-spin text-primary-600" />}
                  {d.status === 'done' && <IconCheck size={13} className="text-primary-600" />}
                  {d.status === 'failed' && <IconAlertTriangle size={13} className="text-danger-600" />}
                  {['pending', 'skipped', 'stopped'].includes(d.status) && <span className="inline-block w-[13px] text-center text-neutral-300">•</span>}
                </span>
                <span className="min-w-0">
                  <span className={`font-medium ${d.status === 'pending' || d.status === 'skipped' ? 'text-neutral-400' : 'text-neutral-800'}`}>
                    {DAY_NAMES[d.day]}
                  </span>
                  {d.status === 'skipped' && <span className="text-neutral-400"> — already planned</span>}
                  {d.status === 'stopped' && <span className="text-neutral-400"> — stopped</span>}
                  {d.status === 'failed' && <span className="text-danger-600"> — {d.error}</span>}
                  {d.status === 'done' && (
                    <span className="block text-neutral-500 truncate" title={d.meals.map((m) => m.name).join(', ')}>
                      {d.meals.map((m) => `${SLOT_SHORT[m.mealType]}: ${m.name}`).join(' · ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
