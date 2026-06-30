import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconPlus } from '@tabler/icons-react';
import { createEatingOutLog } from '../../api/client.js';
import { dollarsToCents } from '../../utils/currency.js';
import { formatDate } from '../../utils/dates.js';
import BottomSheet from '../ui/BottomSheet.jsx';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
const MEAL_LABELS = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };

function LogForm({ onClose }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(formatDate(new Date()));
  const [mealType, setMealType] = useState('LUNCH');
  const [place, setPlace] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('SOLO');

  const mutation = useMutation({
    mutationFn: (data) => createEatingOutLog(data),
    onSuccess: () => {
      toast.success('Eating out logged');
      queryClient.invalidateQueries({ queryKey: ['eatingout-logs'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      queryClient.invalidateQueries({ queryKey: ['budget-week'] });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    mutation.mutate({ date, mealType, placeName: place || undefined, amount: dollarsToCents(amount), householdMode: mode });
  };

  return (
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
        <label className="block text-sm font-medium text-neutral-700 mb-1">Amount spent</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="0.01" required placeholder="0.00"
            className="w-full pl-7 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Mode</label>
        <div className="flex gap-2">
          {['SOLO', 'DAD_MODE'].map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${mode === m ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}>
              {m === 'SOLO' ? 'Solo' : 'Dad mode'}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending}
        className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
        {mutation.isPending ? 'Logging...' : 'Log eating out'}
      </button>
    </form>
  );
}

export default function LogEatOutFAB() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile FAB */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-primary-600 text-white shadow-lg flex items-center justify-center hover:bg-primary-700 transition-colors"
        aria-label="Log eating out"
      >
        <IconPlus size={24} />
      </button>

      {/* Desktop button — rendered by parent in page header */}

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Log eating out">
        <LogForm onClose={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}

export function LogEatOutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
        <IconPlus size={16} />
        Log eating out
      </button>
      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Log eating out">
        <LogForm onClose={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}
