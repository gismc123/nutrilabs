import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import BottomSheet from '../ui/BottomSheet.jsx';
import { createEatingOutLog } from '../../api/client.js';
import { dollarsToCents } from '../../utils/currency.js';
import { formatDate } from '../../utils/dates.js';

export default function EatOutModal({ isOpen, onClose, mealType, householdMode }) {
  const queryClient = useQueryClient();
  const [place, setPlace] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState(householdMode ?? 'SOLO');

  const mutation = useMutation({
    mutationFn: createEatingOutLog,
    onSuccess: () => {
      toast.success("Logged — nice try, fast food 👊");
      queryClient.invalidateQueries({ queryKey: ['budget-week'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      onClose();
      setPlace('');
      setAmount('');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    mutation.mutate({
      date: formatDate(new Date()),
      placeName: place || null,
      amount: dollarsToCents(amount),
      mealType: mealType ?? 'LUNCH',
      householdMode: mode,
    });
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Log eating out">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Restaurant name</label>
          <input
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Restaurant name"
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Amount spent $</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
            required
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Household mode</label>
          <div className="flex gap-2">
            {['SOLO', 'DAD_MODE'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  mode === m
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                {m === 'SOLO' ? 'Solo' : 'Dad mode'}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Logging...' : 'Log it'}
        </button>
      </form>
    </BottomSheet>
  );
}
