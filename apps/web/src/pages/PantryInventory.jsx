import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconBarcode, IconPlus, IconSearch } from '@tabler/icons-react';
import {
  getPantryInventory, scanBarcode, addPantryInventoryItem, searchPantryProduct,
} from '../api/client.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import BottomSheet from '../components/ui/BottomSheet.jsx';
import BarcodeScanner from '../components/pantry/BarcodeScanner.jsx';
import ProductPreviewCard from '../components/pantry/ProductPreviewCard.jsx';
import InventoryItemRow from '../components/pantry/InventoryItemRow.jsx';

const MANUAL_FIELDS = [
  { key: 'name', label: 'Product name', required: true, type: 'text' },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'servingSize', label: 'Serving size', placeholder: 'e.g. 30g', type: 'text' },
  { key: 'quantity', label: 'Units on hand', type: 'number', default: '1' },
  { key: 'calories', label: 'Calories per serving', type: 'number' },
  { key: 'proteinG', label: 'Protein (g)', type: 'number' },
  { key: 'carbsG', label: 'Carbs (g)', type: 'number' },
  { key: 'fatG', label: 'Fat (g)', type: 'number' },
];

function ManualAddForm({ onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ quantity: '1' });

  const mutation = useMutation({
    mutationFn: (data) => addPantryInventoryItem(data),
    onSuccess: () => {
      toast.success('Item added to pantry');
      queryClient.invalidateQueries({ queryKey: ['pantry-inventory'] });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    ['calories', 'proteinG', 'carbsG', 'fatG', 'servingSizeG'].forEach((k) => {
      if (data[k]) data[k] = parseFloat(data[k]);
    });
    if (data.quantity) data.quantity = parseFloat(data.quantity);
    mutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {MANUAL_FIELDS.map((f) => (
        <div key={f.key}>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            {f.label}{f.required && ' *'}
          </label>
          <input
            type={f.type || 'text'}
            required={f.required}
            value={form[f.key] ?? f.default ?? ''}
            onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
      ))}
      <button
        type="submit"
        disabled={mutation.isPending || !form.name}
        className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
      >
        {mutation.isPending ? 'Adding…' : 'Add to pantry'}
      </button>
    </form>
  );
}

export default function PantryInventory() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => { document.title = 'Pantry — NutriLabs'; }, []);

  const { data: items, isLoading } = useQuery({
    queryKey: ['pantry-inventory', search],
    queryFn: () => getPantryInventory(search ? { search } : {}),
  });

  const addMutation = useMutation({
    mutationFn: (data) => addPantryInventoryItem(data),
    onSuccess: () => {
      toast.success('Added to pantry');
      queryClient.invalidateQueries({ queryKey: ['pantry-inventory'] });
      setPreviewOpen(false);
      setPreviewProduct(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleScan = async (barcode) => {
    setScannerOpen(false);
    const scanToast = toast.loading('Looking up product…');
    try {
      const result = await scanBarcode(barcode);
      toast.dismiss(scanToast);
      if (result?.alreadyExisted) {
        toast.success('Quantity updated in pantry');
        queryClient.invalidateQueries({ queryKey: ['pantry-inventory'] });
      } else {
        setPreviewProduct(result);
        setPreviewOpen(true);
      }
    } catch (err) {
      toast.dismiss(scanToast);
      if (err.message?.includes('PRODUCT_NOT_FOUND') || err.message?.includes('not found')) {
        setSearchQuery(barcode);
        setSearchOpen(true);
      } else {
        toast.error(err.message || 'Scan failed');
      }
    }
  };

  const handleSearchProducts = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const results = await searchPantryProduct(searchQuery);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleConfirmAdd = (productWithQty) => {
    addMutation.mutate({
      name: productWithQty.name,
      brand: productWithQty.brand,
      barcode: productWithQty.barcode,
      openFoodFactsId: productWithQty.openFoodFactsId,
      imageUrl: productWithQty.imageUrl,
      servingSize: productWithQty.servingSize,
      servingSizeG: productWithQty.servingSizeG,
      calories: productWithQty.calories != null ? Math.round(productWithQty.calories) : null,
      proteinG: productWithQty.proteinG,
      carbsG: productWithQty.carbsG,
      fatG: productWithQty.fatG,
      quantity: productWithQty.quantity ?? 1,
    });
  };

  const handleSelectSearchResult = (p) => {
    setPreviewProduct({
      name: p.name,
      brand: p.brand,
      barcode: p.barcode,
      imageUrl: p.imageUrl,
      calories: p.calories,
    });
    setPreviewOpen(true);
    setSearchOpen(false);
  };

  return (
    <ErrorBoundary>
      <div className="px-4 pt-4 pb-24 md:pb-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-neutral-900">Pantry</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setScannerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <IconBarcode size={16} />
              Scan item
            </button>
            <button
              onClick={() => setManualOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <IconPlus size={16} />
              Add manually
            </button>
          </div>
        </div>

        <div className="relative mb-4">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pantry…"
            className="w-full pl-9 pr-3 py-2.5 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : items?.length === 0 ? (
          <EmptyState
            icon="ShoppingBag"
            title="Your pantry is empty"
            message="Scan a barcode or add items manually to track what you have on hand."
          />
        ) : (
          <div className="space-y-3">
            {(items ?? []).map((item) => (
              <InventoryItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <BarcodeScanner
        isOpen={scannerOpen}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
      />

      <BottomSheet isOpen={previewOpen} onClose={() => { setPreviewOpen(false); setPreviewProduct(null); }} title="Product found">
        <ProductPreviewCard
          product={previewProduct}
          onConfirm={handleConfirmAdd}
          onDismiss={() => { setPreviewOpen(false); setPreviewProduct(null); setScannerOpen(true); }}
          isLoading={addMutation.isPending}
        />
      </BottomSheet>

      <BottomSheet isOpen={searchOpen} onClose={() => setSearchOpen(false)} title="Search for product">
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">Product not found — try searching by name.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchProducts()}
              placeholder="Product name…"
              className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            <button
              onClick={handleSearchProducts}
              disabled={searchLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {searchLoading ? '…' : 'Search'}
            </button>
          </div>
          <div className="space-y-2">
            {searchResults.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSelectSearchResult(p)}
                className="w-full text-left p-3 border border-neutral-100 rounded-xl hover:bg-neutral-50 transition-colors"
              >
                <p className="text-sm font-medium text-neutral-900">{p.name || 'Unknown'}</p>
                {p.brand && <p className="text-xs text-neutral-400">{p.brand}</p>}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={manualOpen} onClose={() => setManualOpen(false)} title="Add item manually">
        <ManualAddForm onClose={() => setManualOpen(false)} />
      </BottomSheet>
    </ErrorBoundary>
  );
}
