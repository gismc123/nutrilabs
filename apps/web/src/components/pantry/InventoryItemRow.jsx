import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconMinus, IconPlus, IconTrash, IconLayoutGridAdd } from '@tabler/icons-react';
import { updatePantryInventoryItem, deletePantryInventoryItem } from '../../api/client.js';
import AddToPlanModal from './AddToPlanModal.jsx';
import { useUiStore } from '../../store/uiStore.js';

export default function InventoryItemRow({ item }) {
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);
  const [addToPlanOpen, setAddToPlanOpen] = useState(false);
  const debounceRef = useRef(null);

  const updateMutation = useMutation({
    mutationFn: (data) => updatePantryInventoryItem(item.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pantry-inventory'] }),
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePantryInventoryItem(item.id),
    onSuccess: () => {
      toast.success('Item removed');
      queryClient.invalidateQueries({ queryKey: ['pantry-inventory'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleQuantityChange = (delta) => {
    const next = Math.max(0, Number(item.quantity) + delta);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateMutation.mutate({ quantity: next });
    }, 400);
  };

  const handleDelete = () => {
    showConfirm('Remove item', `Remove "${item.name}" from your pantry?`, () => deleteMutation.mutate());
  };

  const cal = item.calories != null ? Math.round(item.calories) : null;
  const macros = [
    { label: 'P', value: item.proteinG != null ? `${Number(item.proteinG).toFixed(0)}g` : null },
    { label: 'C', value: item.carbsG != null ? `${Number(item.carbsG).toFixed(0)}g` : null },
    { label: 'F', value: item.fatG != null ? `${Number(item.fatG).toFixed(0)}g` : null },
  ].filter((m) => m.value != null);

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-100 p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 leading-tight">{item.name}</p>
          {item.brand && <p className="text-xs text-neutral-400 mt-0.5">{item.brand}</p>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {cal != null && (
              <span className="text-[11px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full">{cal} cal</span>
            )}
            {macros.map((m) => (
              <span key={m.label} className="text-[11px] bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded-full">
                {m.label}: {m.value}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 border border-neutral-200 rounded-lg overflow-hidden">
            <button
              onClick={() => handleQuantityChange(-1)}
              className="px-2 py-1.5 text-neutral-500 hover:bg-neutral-50 transition-colors"
            >
              <IconMinus size={14} />
            </button>
            <span className="px-2 text-sm font-medium text-neutral-900 min-w-[2rem] text-center">
              {Number(item.quantity)}
            </span>
            <button
              onClick={() => handleQuantityChange(1)}
              className="px-2 py-1.5 text-neutral-500 hover:bg-neutral-50 transition-colors"
            >
              <IconPlus size={14} />
            </button>
          </div>

          <button
            onClick={() => setAddToPlanOpen(true)}
            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded-lg hover:bg-neutral-50 transition-colors"
            title="Add to meal plan"
          >
            <IconLayoutGridAdd size={16} />
          </button>

          <button
            onClick={handleDelete}
            className="p-1.5 text-neutral-400 hover:text-danger-600 rounded-lg hover:bg-neutral-50 transition-colors"
            title="Remove"
          >
            <IconTrash size={16} />
          </button>
        </div>
      </div>

      <AddToPlanModal
        item={item}
        isOpen={addToPlanOpen}
        onClose={() => setAddToPlanOpen(false)}
      />
    </>
  );
}
