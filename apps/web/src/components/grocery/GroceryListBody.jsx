import { useState } from 'react';
import {
  IconLeaf, IconMeat, IconBottle, IconWheat,
  IconBox, IconSnowflake, IconCategory, IconChevronDown, IconChevronUp, IconPlus,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { deletePantryItem, getPantry } from '../../api/client.js';
import { useQuery } from '@tanstack/react-query';
import { centsToDisplay } from '../../utils/currency.js';
import GroceryItemRow from './GroceryItemRow.jsx';

const CATEGORY_ORDER = ['PRODUCE', 'PROTEIN', 'DAIRY', 'GRAINS', 'CANNED', 'FROZEN', 'MISC'];

const CATEGORY_META = {
  PRODUCE:  { label: 'Produce',  Icon: IconLeaf },
  PROTEIN:  { label: 'Protein',  Icon: IconMeat },
  DAIRY:    { label: 'Dairy',    Icon: IconBottle },
  GRAINS:   { label: 'Grains',   Icon: IconWheat },
  CANNED:   { label: 'Canned',   Icon: IconBox },
  FROZEN:   { label: 'Frozen',   Icon: IconSnowflake },
  MISC:     { label: 'Misc',     Icon: IconCategory },
};

const PRICE_KEYS = {
  Walmart: 'estimatedPriceWalmart',
  Kroger: 'estimatedPriceKroger',
  Aldi: 'estimatedPriceAldi',
};

function categorySubtotal(items, store) {
  const key = PRICE_KEYS[store];
  const total = items.reduce((sum, i) => sum + (i[key] ?? 0), 0);
  return total > 0 ? centsToDisplay(total) : null;
}

export default function GroceryListBody({ itemsByCategory, listId, activeStore, excludedStaples }) {
  const [excludedOpen, setExcludedOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: pantryItems } = useQuery({
    queryKey: ['pantry'],
    queryFn: getPantry,
    staleTime: 60_000,
    enabled: (excludedStaples?.length ?? 0) > 0,
  });

  const removePantryMutation = useMutation({
    mutationFn: (id) => deletePantryItem(id),
    onSuccess: () => {
      toast.success('Item removed from pantry staples');
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAddBack = (stapleName) => {
    const staple = (pantryItems ?? []).find((p) => p.name.toLowerCase() === stapleName.toLowerCase());
    if (staple) {
      removePantryMutation.mutate(staple.id);
    } else {
      toast.error(`Could not find "${stapleName}" in pantry staples`);
    }
  };

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => {
        const items = itemsByCategory[cat];
        if (!items || items.length === 0) return null;
        const { label, Icon } = CATEGORY_META[cat];
        const subtotal = categorySubtotal(items, activeStore);
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className="text-neutral-400 flex-shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 flex-1">{label}</span>
              {subtotal && <span className="text-xs text-neutral-400">{subtotal}</span>}
            </div>
            <div className="bg-white rounded-xl border border-neutral-100 px-3">
              {items.map((item) => (
                <GroceryItemRow
                  key={item.id}
                  item={item}
                  listId={listId}
                  activeStore={activeStore}
                />
              ))}
            </div>
          </div>
        );
      })}

      {excludedStaples && excludedStaples.length > 0 && (
        <div>
          <button
            onClick={() => setExcludedOpen((v) => !v)}
            className="flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            {excludedOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            Excluded (pantry staples) · {excludedStaples.length}
          </button>
          {excludedOpen && (
            <div className="mt-2 bg-neutral-50 rounded-xl border border-neutral-100 px-3 py-1">
              {excludedStaples.map((name) => (
                <div key={name} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                  <span className="text-sm text-neutral-500">{name}</span>
                  <button
                    onClick={() => handleAddBack(name)}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <IconPlus size={12} />
                    Add back
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
