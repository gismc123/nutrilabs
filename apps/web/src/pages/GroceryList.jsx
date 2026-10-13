import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMealPlanWeek, getGroceryList, getStorePrices } from '../api/client.js';
import { formatDate } from '../utils/dates.js';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import StoreSelector from '../components/grocery/StoreSelector.jsx';
import GroceryListBody from '../components/grocery/GroceryListBody.jsx';
import ListToolbar from '../components/grocery/ListToolbar.jsx';
import PriceStatus from '../components/grocery/PriceStatus.jsx';

// Default tab: the store that priced the most items, cheapest among those.
function defaultStore(retailers) {
  if (!retailers.length) return null;
  const maxPriced = Math.max(...retailers.map((r) => r.pricedCount));
  return retailers
    .filter((r) => r.pricedCount === maxPriced)
    .reduce((a, b) => (b.totalCents < a.totalCents ? b : a)).id;
}

function GroceryListContent() {
  const navigate = useNavigate();
  const today = formatDate(new Date());
  const [activeStore, setActiveStore] = useState(null);

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

  const listId = groceryData?.id;
  const { data: storePrices, isLoading: loadingPrices, error: pricesError } = useQuery({
    // generatedAt changes whenever the list is rebuilt from the plan.
    queryKey: ['store-prices', listId, groceryData?.generatedAt],
    queryFn: () => getStorePrices(listId),
    enabled: !!listId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const retailers = storePrices?.retailers ?? [];
  const prices = storePrices?.prices ?? {};

  useEffect(() => {
    if (retailers.length && !retailers.some((r) => r.id === activeStore)) {
      setActiveStore(defaultStore(retailers));
    }
  }, [storePrices]);

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
  const excludedStaples = groceryData?.excludedStaples ?? [];
  const missingIngredients = groceryData?.mealsWithoutIngredients ?? [];
  const activeRetailer = retailers.find((r) => r.id === activeStore) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Grocery List</h1>
      </div>

      <ListToolbar
        mealPlanId={mealPlanId}
        listId={groceryData?.id}
        hasCheckedItems={hasCheckedItems}
        canRefreshPrices={retailers.some((r) => r.method === 'api')}
        pricesQueryKey={['store-prices', listId, groceryData?.generatedAt]}
      />

      <StoreSelector retailers={retailers} activeStore={activeStore} onStoreChange={setActiveStore} />

      <PriceStatus retailer={activeRetailer} isLoading={loadingPrices} error={pricesError} />

      {missingIngredients.length > 0 && (
        <div className="bg-accent-50 border border-accent-100 rounded-xl px-4 py-3 text-sm text-accent-900">
          <p className="font-medium">
            {missingIngredients.length} planned {missingIngredients.length === 1 ? 'meal has' : 'meals have'} no ingredients and {missingIngredients.length === 1 ? "isn't" : "aren't"} on this list:
          </p>
          <p className="mt-1 text-xs">
            {missingIngredients.map((m) => `${m.recipeName} (${m.dayOfWeek} ${m.mealType.toLowerCase()})`).join(' · ')}
          </p>
        </div>
      )}

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
          prices={prices}
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
