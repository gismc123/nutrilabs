import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import BottomSheet from '../ui/BottomSheet.jsx';
import { logGrocerySpend } from '../../api/client.js';
import { formatDate } from '../../utils/dates.js';

const STORES = ['Walmart', 'Kroger', 'Aldi', 'Other'];

export default function LogSpendModal({ isOpen, onClose, listId }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [store, setStore] = useState('Walmart');
  const [date, setDate] = useState(formatDate(new Date()));

  const mutation = useMutation({
    mutationFn: () => logGrocerySpend(listId, { amount: parseFloat(amount), store }),
    onSuccess: () => {
      toast.success('Spend logged');
      queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      queryClient.invalidateQueries({ queryKey: ['budget-weekly'] });
      onClose();
      setAmount('');
      setStore('Walmart');
      setDate(formatDate(new Date()));
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    mutation.mutate();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Log what I spent">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Amount spent</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
              required
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Store</label>
          <select
            value={store}
            onChange={(e) => setStore(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 bg-white"
          >
            {STORES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending || !amount || parseFloat(amount) <= 0}
          className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </form>
    </BottomSheet>
  );
}
