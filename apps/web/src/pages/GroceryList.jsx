import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMealPlanWeek, getGroceryList } from '../api/client.js';
import { formatDate } from '../utils/dates.js';
import { useSettings } from '../hooks/useSettings.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import StoreSelector from '../components/grocery/StoreSelector.jsx';
import GroceryListBody from '../components/grocery/GroceryListBody.jsx';
import ListToolbar from '../components/grocery/ListToolbar.jsx';
import KrogerPriceStatus from '../components/grocery/KrogerPriceStatus.jsx';

const STORES = ['Walmart', 'Kroger', 'Aldi'];

function defaultStore(itemsByCategory) {
  const allItems = Object.values(itemsByCategory).flat();
  const totals = {
    Walmart: allItems.reduce((s, i) => s + (i.estimatedPriceWalmart ?? 0), 0),
    Kroger: allItems.reduce((s, i) => s + (i.estimatedPriceKroger ?? 0), 0),
    Aldi: allItems.reduce((s, i) => s + (i.estimatedPriceAldi ?? 0), 0),
  };
  const withData = STORES.filter((s) => totals[s] > 0);
  if (withData.length === 0) return 'Walmart';
  return withData.reduce((best, s) => (totals[s] < totals[best] ? s : best));
}

function GroceryListContent() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const today = formatDate(new Date());
  const [activeStore, setActiveStore] = useState('Walmart');
  const [excludedStaples, setExcludedStaples] = useState(null);

  const { data: weekPlan, isLoading: loadingPlan } = useQuery({
    queryKey: ['mealplan-week', today],
    queryFn: () => getMealPlanWeek(today),
  });

  const mealPlanId = weekPlan?.id;

  const { data: groceryData, isLoading: loadingGrocery } = useQuery({
    queryKey: ['grocery-list', mealPlanId],
    queryFn: () => getGroceryList(mealPlanId),
    enabled: !!mealPlanId,
  });

  useEffect(() => {
    if (groceryData?.excludedStaples) {
      setExcludedStaples(groceryData.excludedStaples);
    }
  }, [groceryData?.excludedStaples]);

  useEffect(() => {
    if (groceryData?.itemsByCategory) {
      setActiveStore(defaultStore(groceryData.itemsByCategory));
    }
  }, [groceryData?.id]);

  useEffect(() => {
    document.title = 'NutriLabs — Grocery List';
  }, []);

  if (loadingPlan || (mealPlanId && loadingGrocery)) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!weekPlan) {
    return (
      <EmptyState
        icon="ShoppingCart"
        title="No meal plan for this week"
        message="Add meals to your week plan to generate a grocery list."
        actionLabel="Go plan your week"
        onAction={() => navigate('/plan')}
      />
    );
  }

  const itemsByCategory = groceryData?.itemsByCategory ?? {};
  const allItems = Object.values(itemsByCategory).flat();
  const hasCheckedItems = allItems.some((i) => i.checked);
  const krogerConfigured = !!settings?.krogerConfigured;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Grocery List</h1>
      </div>

      <ListToolbar
        mealPlanId={mealPlanId}
        listId={groceryData?.id}
        hasCheckedItems={hasCheckedItems}
        krogerConfigured={krogerConfigured}
      />

      <StoreSelector
        items={allItems}
        activeStore={activeStore}
        onStoreChange={setActiveStore}
      />

      <KrogerPriceStatus
        krogerConfigured={krogerConfigured}
        krogerPricesAvailable={groceryData?.krogerPricesAvailable ?? false}
        generatedAt={groceryData?.generatedAt}
      />

      {allItems.length === 0 ? (
        <EmptyState
          icon="ShoppingCart"
          title="Your list is empty"
          message="All items may be pantry staples or the meal plan has no recipes."
        />
      ) : (
        <GroceryListBody
          itemsByCategory={itemsByCategory}
          listId={groceryData?.id}
          activeStore={activeStore}
          excludedStaples={excludedStaples}
        />
      )}
    </div>
  );
}

export default function GroceryList() {
  return (
    <ErrorBoundary>
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <GroceryListContent />
      </div>
    </ErrorBoundary>
  );
}
