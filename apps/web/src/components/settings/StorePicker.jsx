import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 75, 100];

/**
 * ZIP + search distance + store list, saved to settings under `fields`
 * ({ zip, radius, id, name } setting keys).
 *
 * autoSearch: look stores up as soon as the ZIP/distance is valid (cheap APIs).
 * Otherwise a "Find stores" button triggers it (Meijer's lookup drives a real
 * browser, so it shouldn't fire on every keystroke).
 * allowAuto: offer "Nearest store automatically" instead of a fixed store.
 */
export default function StorePicker({
  queryKey, fields, settings, saveSettings, fetchStores, enabled = true,
  autoSearch = true, allowAuto = true, chainLabel, slowHint,
}) {
  const [zip, setZip] = useState('');
  const [radius, setRadius] = useState(25);
  const [requested, setRequested] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!settings) return;
    setZip(settings[fields.zip] ?? '');
    setRadius(settings[fields.radius] ?? 25);
  }, [settings?.[fields.zip], settings?.[fields.radius]]);

  const cleanZip = zip.trim();
  const zipValid = /^\d{5}$/.test(cleanZip);
  const searchKey = autoSearch ? { zip: cleanZip, radius } : requested;

  const { data, isFetching, error } = useQuery({
    queryKey: [queryKey, searchKey?.zip, searchKey?.radius],
    queryFn: () => fetchStores(searchKey),
    enabled: enabled && !!searchKey && /^\d{5}$/.test(searchKey.zip ?? ''),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const stores = data?.stores ?? [];

  const handleZip = (value) => {
    setZip(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveSettings({ [fields.zip]: value.trim() || null }), 800);
  };

  const handleRadius = (value) => {
    setRadius(value);
    saveSettings({ [fields.radius]: value });
  };

  const selectStore = (store) => {
    saveSettings(store
      ? { [fields.id]: store.locationId, [fields.name]: store.name }
      : { [fields.id]: null, [fields.name]: null });
  };

  const selectedId = settings?.[fields.id] ?? null;
  const selectedMissing = selectedId && data && !isFetching && !stores.some((s) => s.locationId === selectedId);
  const showList = enabled && (autoSearch ? zipValid : !!requested);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[8rem]">
          <label className="block text-sm font-medium text-neutral-700 mb-1">ZIP code</label>
          <input
            type="text"
            inputMode="numeric"
            value={zip}
            onChange={(e) => handleZip(e.target.value)}
            placeholder="e.g. 42134"
            maxLength={5}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
        <div className="flex-1 min-w-[8rem]">
          <label className="block text-sm font-medium text-neutral-700 mb-1">Search distance</label>
          <select
            value={radius}
            onChange={(e) => handleRadius(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>Within {r} miles</option>)}
          </select>
        </div>
        {!autoSearch && (
          <button
            type="button"
            onClick={() => setRequested({ zip: cleanZip, radius })}
            disabled={!enabled || !zipValid || isFetching}
            className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {isFetching ? 'Searching…' : 'Find stores'}
          </button>
        )}
      </div>

      {!autoSearch && selectedId && !showList && (
        <p className="text-xs text-primary-700">Pricing from {settings?.[fields.name] ?? selectedId}</p>
      )}

      {showList && (
        <div>
          <p className="block text-sm font-medium text-neutral-700 mb-1">
            Store for prices {isFetching && <span className="text-xs font-normal text-neutral-400">· {slowHint ?? 'searching…'}</span>}
          </p>
          {error && <p className="text-xs text-danger-600 mb-1">{error.message}</p>}

          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-72 overflow-y-auto">
            {allowAuto && (
              <StoreOption
                checked={!selectedId}
                onSelect={() => selectStore(null)}
                title="Nearest store automatically"
                subtitle={stores[0] ? `Currently ${stores[0].name}` : 'Uses the closest store within the search distance'}
              />
            )}
            {selectedMissing && (
              <StoreOption
                checked
                onSelect={() => {}}
                title={settings?.[fields.name] ?? selectedId}
                subtitle="Selected store — outside the current search distance"
              />
            )}
            {stores.map((store) => (
              <StoreOption
                key={store.locationId}
                checked={selectedId === store.locationId}
                onSelect={() => selectStore(store)}
                title={store.name}
                subtitle={store.address}
                meta={store.distanceMiles != null ? `${store.distanceMiles} mi` : null}
              />
            ))}
            {!isFetching && !error && data && stores.length === 0 && (
              <p className="px-3 py-3 text-xs text-neutral-500">
                No {chainLabel} stores within {searchKey?.radius} miles of {searchKey?.zip}. Try a larger search distance.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StoreOption({ checked, onSelect, title, subtitle, meta }) {
  return (
    <label className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-neutral-50 ${checked ? 'bg-primary-50' : ''}`}>
      <input type="radio" checked={checked} onChange={onSelect} className="mt-0.5 text-primary-600 focus:ring-primary-600" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-neutral-800">{title}</span>
        {subtitle && <span className="block text-xs text-neutral-500 truncate">{subtitle}</span>}
      </span>
      {meta && <span className="text-xs text-neutral-400 flex-shrink-0">{meta}</span>}
    </label>
  );
}
