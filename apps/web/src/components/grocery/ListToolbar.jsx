import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconRefresh, IconList, IconCurrencyDollar } from '@tabler/icons-react';
import { generateGroceryList, getGroceryPrices } from '../../api/client.js';
import { useUiStore } from '../../store/uiStore.js';
import LogSpendModal from './LogSpendModal.jsx';

export default function ListToolbar({ mealPlanId, listId, hasCheckedItems, krogerConfigured }) {
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);
  const [spendOpen, setSpendOpen] = useState(false);

  const regenerateMutation = useMutation({
    mutationFn: () => generateGroceryList(mealPlanId),
    onSuccess: () => {
      toast.success('Grocery list regenerated');
      queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const pricesMutation = useMutation({
    mutationFn: () => getGroceryPrices(listId),
    onSuccess: () => {
      toast.success('Kroger prices updated');
      queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRegenerate = () => {
    if (hasCheckedItems) {
      showConfirm(
        'Regenerate grocery list',
        'Some items are already checked. Regenerating will clear the list. Continue?',
        () => regenerateMutation.mutate()
      );
    } else {
      regenerateMutation.mutate();
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={handleRegenerate}
        disabled={regenerateMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors"
      >
        <IconList size={14} />
        {regenerateMutation.isPending ? 'Regenerating...' : 'Regenerate from plan'}
      </button>

      {krogerConfigured && (
        <button
          onClick={() => pricesMutation.mutate()}
          disabled={pricesMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors"
        >
          <IconRefresh size={14} />
          {pricesMutation.isPending ? 'Refreshing...' : 'Refresh Kroger prices'}
        </button>
      )}

      <button
        onClick={() => setSpendOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
      >
        <IconCurrencyDollar size={14} />
        Log what I spent
      </button>

      <LogSpendModal isOpen={spendOpen} onClose={() => setSpendOpen(false)} listId={listId} />
    </div>
  );
}
