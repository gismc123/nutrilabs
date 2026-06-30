import { useState } from 'react';
import { IconShoppingBag } from '@tabler/icons-react';

export default function ProductPreviewCard({ product, onConfirm, onDismiss, isLoading }) {
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="w-20 h-20 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <IconShoppingBag size={32} className="text-neutral-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-neutral-900 text-sm leading-tight">{product.name || 'Unknown product'}</p>
          {product.brand && <p className="text-xs text-neutral-500 mt-0.5">{product.brand}</p>}
          {product.servingSize && <p className="text-xs text-neutral-400 mt-1">Serving: {product.servingSize}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { label: 'Cal', value: product.calories != null ? Math.round(product.calories) : null },
          { label: 'Protein', value: product.proteinG != null ? `${Number(product.proteinG).toFixed(1)}g` : null },
          { label: 'Carbs', value: product.carbsG != null ? `${Number(product.carbsG).toFixed(1)}g` : null },
          { label: 'Fat', value: product.fatG != null ? `${Number(product.fatG).toFixed(1)}g` : null },
        ].map(({ label, value }) => value != null && (
          <div key={label} className="flex-1 bg-neutral-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-semibold text-neutral-900">{value}</p>
            <p className="text-[10px] text-neutral-400">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Units on hand</label>
        <input
          type="number"
          min="0.5"
          step="0.5"
          value={quantity}
          onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>

      <button
        onClick={() => onConfirm({ ...product, quantity })}
        disabled={isLoading}
        className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
      >
        {isLoading ? 'Adding…' : 'Add to pantry'}
      </button>
      <button
        onClick={onDismiss}
        className="w-full text-sm text-neutral-500 hover:text-neutral-700"
      >
        Not the right product
      </button>
    </div>
  );
}
