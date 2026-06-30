import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconEdit, IconTrash, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { getEatingOutLogs, updateEatingOutLog, deleteEatingOutLog } from '../../api/client.js';
import { centsToDisplay, dollarsToCents } from '../../utils/currency.js';
import { formatDate } from '../../utils/dates.js';
import EmptyState from '../ui/EmptyState.jsx';
import { SkeletonCard } from '../ui/Skeleton.jsx';
import BottomSheet from '../ui/BottomSheet.jsx';
import { useUiStore } from '../../store/uiStore.js';

const PAGE_SIZE = 10;
const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };
const MODE_LABELS = { SOLO: 'Solo', DAD_MODE: 'Dad' };
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

function EditSheet({ log, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(formatDate(new Date(log.date)));
  const [mealType, setMealType] = useState(log.mealType);
  const [place, setPlace] = useState(log.placeName ?? '');
  const [amount, setAmount] = useState((log.amount / 100).toFixed(2));
  const [mode, setMode] = useState(log.householdMode);

  const mutation = useMutation({
    mutationFn: (data) => updateEatingOutLog(log.id, data),
    onSuccess: () => {
      toast.success('Entry updated');
      queryClient.invalidateQueries({ queryKey: ['eatingout-logs'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      date,
      mealType,
      placeName: place || undefined,
      amount: dollarsToCents(amount),
      householdMode: mode,
    });
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Edit entry">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Meal</label>
          <select value={mealType} onChange={(e) => setMealType(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600">
            {MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Restaurant (optional)</label>
          <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Restaurant name"
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="0.01" required
              className="w-full pl-7 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Mode</label>
          <div className="flex gap-2">
            {['SOLO', 'DAD_MODE'].map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${mode === m ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={mutation.isPending}
          className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {mutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </form>
    </BottomSheet>
  );
}

export default function EatOutLogTable() {
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [editLog, setEditLog] = useState(null);
  const monthOptions = getMonthOptions();

  const { data: logs, isLoading } = useQuery({
    queryKey: ['eatingout-logs', month],
    queryFn: () => getEatingOutLogs(month ? { month } : {}),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteEatingOutLog(id),
    onSuccess: () => {
      toast.success('Entry deleted');
      queryClient.invalidateQueries({ queryKey: ['eatingout-logs'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = (log) => {
    showConfirm('Delete entry', `Delete eating out entry for ${formatDate(new Date(log.date))}?`, () =>
      deleteMutation.mutate(log.id)
    );
  };

  if (isLoading) return <SkeletonCard className="h-40" />;

  const all = logs ?? [];
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const paginated = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="bg-white rounded-xl border border-neutral-100">
      <div className="flex items-center justify-between p-4 border-b border-neutral-100">
        <h2 className="text-sm font-semibold text-neutral-900">Eating out log</h2>
        <select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }}
          className="text-xs border border-neutral-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600">
          <option value="">All time</option>
          {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {all.length === 0 ? (
        <EmptyState title="No eating out logged yet" message="Use the + button to log a meal out." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Meal</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Place</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Mode</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {paginated.map((log) => (
                  <tr key={log.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                    <td className="px-4 py-3 text-neutral-700">{formatDate(new Date(log.date))}</td>
                    <td className="px-4 py-3 text-neutral-700">{MEAL_LABELS[log.mealType]}</td>
                    <td className="px-4 py-3 text-neutral-500">{log.placeName ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">{centsToDisplay(log.amount)}</td>
                    <td className="px-4 py-3 text-neutral-500">{MODE_LABELS[log.householdMode]}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setEditLog(log)} className="p-1 text-neutral-400 hover:text-primary-600 rounded">
                          <IconEdit size={16} />
                        </button>
                        <button onClick={() => handleDelete(log)} className="p-1 text-neutral-400 hover:text-danger-600 rounded">
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-neutral-100">
            {paginated.map((log) => (
              <div key={log.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {MEAL_LABELS[log.mealType]}{log.placeName ? ` — ${log.placeName}` : ''}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {formatDate(new Date(log.date))} · {MODE_LABELS[log.householdMode]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-900">{centsToDisplay(log.amount)}</span>
                    <button onClick={() => setEditLog(log)} className="p-1 text-neutral-400 hover:text-primary-600">
                      <IconEdit size={16} />
                    </button>
                    <button onClick={() => handleDelete(log)} className="p-1 text-neutral-400 hover:text-danger-600">
                      <IconTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="flex items-center gap-1 text-xs text-neutral-500 disabled:opacity-40 hover:text-neutral-700">
                <IconChevronLeft size={14} /> Prev
              </button>
              <span className="text-xs text-neutral-400">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="flex items-center gap-1 text-xs text-neutral-500 disabled:opacity-40 hover:text-neutral-700">
                Next <IconChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {editLog && <EditSheet log={editLog} isOpen={!!editLog} onClose={() => setEditLog(null)} />}
    </div>
  );
}
