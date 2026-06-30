import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateGroceryItem, deleteGroceryItem, addPantryItem } from '../../api/client.js';
import { centsToDisplay } from '../../utils/currency.js';
import { useUiStore } from '../../store/uiStore.js';

const PRICE_KEYS = {
  Walmart: 'estimatedPriceWalmart',
  Kroger: 'estimatedPriceKroger',
  Aldi: 'estimatedPriceAldi',
};

export default function GroceryItemRow({ item, listId, activeStore, onDeleted }) {
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);
  const [actionMenu, setActionMenu] = useState(false);
  const pressTimer = useRef(null);

  const checkMutation = useMutation({
    mutationFn: (checked) => updateGroceryItem(listId, item.id, { checked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grocery-list'] }),
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteGroceryItem(listId, item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-list'] });
      onDeleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const pantryMutation = useMutation({
    mutationFn: () => addPantryItem({ name: item.name }),
    onSuccess: () => toast.success(`"${item.name}" added to pantry staples`),
    onError: (err) => toast.error(err.message),
  });

  const price = item[PRICE_KEYS[activeStore]];

  const handlePointerDown = () => {
    pressTimer.current = setTimeout(() => setActionMenu(true), 300);
  };

  const handlePointerUp = () => {
    clearTimeout(pressTimer.current);
  };

  const handleDelete = () => {
    setActionMenu(false);
    showConfirm('Remove item', `Remove "${item.name}" from the grocery list?`, () => deleteMutation.mutate());
  };

  const handleAddToPantry = () => {
    setActionMenu(false);
    pantryMutation.mutate();
  };

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-3 py-2.5 px-1 border-b border-neutral-100 last:border-0 transition-opacity ${item.checked ? 'opacity-50' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <input
          type="checkbox"
          checked={item.checked}
          onChange={(e) => checkMutation.mutate(e.target.checked)}
          className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-600 flex-shrink-0 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <span className={`text-sm text-neutral-900 ${item.checked ? 'line-through' : ''}`}>
            {item.name}
          </span>
          {(item.quantity != null || item.unit) && (
            <span className="ml-1.5 text-xs text-neutral-400">
              {item.quantity != null ? Number(item.quantity) : ''}{item.unit ? ` ${item.unit}` : ''}
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-neutral-600 flex-shrink-0">
          {price != null ? centsToDisplay(price) : <span className="text-neutral-300">—</span>}
        </span>
      </div>

      {actionMenu && (
        <div className="absolute right-0 top-full z-20 bg-white rounded-xl shadow-lg border border-neutral-100 py-1 min-w-[160px]">
          <button
            onClick={handleDelete}
            className="w-full text-left px-4 py-2.5 text-sm text-danger-600 hover:bg-neutral-50"
          >
            Delete item
          </button>
          <button
            onClick={handleAddToPantry}
            className="w-full text-left px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Add to pantry staples
          </button>
          <button
            onClick={() => setActionMenu(false)}
            className="w-full text-left px-4 py-2.5 text-sm text-neutral-400 hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
