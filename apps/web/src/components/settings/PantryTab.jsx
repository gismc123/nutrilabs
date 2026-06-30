import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconX, IconPlus } from '@tabler/icons-react';
import { getPantry, addPantryItem, deletePantryItem } from '../../api/client.js';
import { useUiStore } from '../../store/uiStore.js';
import { SkeletonCard } from '../ui/Skeleton.jsx';

export default function PantryTab() {
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);
  const [input, setInput] = useState('');

  const { data: staples, isLoading } = useQuery({
    queryKey: ['pantry'],
    queryFn: getPantry,
  });

  const addMutation = useMutation({
    mutationFn: (name) => addPantryItem({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
      setInput('');
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deletePantryItem(id),
    onSuccess: () => {
      toast.success('Pantry staple removed');
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    addMutation.mutate(name);
  };

  const handleDelete = (staple) => {
    showConfirm('Remove pantry staple', `Remove "${staple.name}" from pantry staples?`, () =>
      deleteMutation.mutate(staple.id)
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Pantry staples are automatically excluded from your grocery list since you always have them on hand.
      </p>

      <div className="flex flex-wrap gap-2">
        {(staples ?? []).map((staple) => (
          <span key={staple.id} className="flex items-center gap-1 px-3 py-1.5 bg-neutral-100 rounded-full text-sm text-neutral-700">
            {staple.name}
            <button onClick={() => handleDelete(staple)}
              className="ml-1 text-neutral-400 hover:text-danger-500 transition-colors">
              <IconX size={14} />
            </button>
          </span>
        ))}
        {(staples ?? []).length === 0 && (
          <p className="text-sm text-neutral-400">No pantry staples yet.</p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a staple..."
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
        <button onClick={handleAdd} disabled={!input.trim() || addMutation.isPending}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          <IconPlus size={16} />
        </button>
      </div>
    </div>
  );
}
