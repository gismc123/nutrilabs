import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/setup'];

api.interceptors.response.use(
  (response) => response.data.data,
  (error) => {
    const isAuthCheck = error.config?.url === '/auth/me';
    const onPublicPage = PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p));
    if (error.response?.status === 401 && !isAuthCheck && !onPublicPage) {
      window.location.href = '/login';
    }
    const message = error.response?.data?.error?.message || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const setupUser = (data) => api.post('/auth/setup', data);
export const login = (email, password) => api.post('/auth/login', { email, password });
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');
export const getSetupStatus = () => api.get('/auth/setup-status');

// ── Health ────────────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/health');

// ── Profiles ──────────────────────────────────────────────────────────────────
export const getProfiles = () => api.get('/profiles');
export const createProfile = (data) => api.post('/profiles', data);
export const updateProfile = (id, data) => api.put(`/profiles/${id}`, data);
export const deleteProfile = (id) => api.delete(`/profiles/${id}`);

// ── Recipes ───────────────────────────────────────────────────────────────────
export const getRecipes = (params) => api.get('/recipes', { params });
export const getRecipe = (id) => api.get(`/recipes/${id}`);
export const createRecipe = (data) => api.post('/recipes', data);
export const updateRecipe = (id, data) => api.put(`/recipes/${id}`, data);
export const deleteRecipe = (id) => api.delete(`/recipes/${id}`);
export const searchExternalRecipes = (params) => api.get('/recipes/search/external', { params });
export const getExternalRecipe = (spoonacularId) => api.get(`/recipes/search/external/${spoonacularId}`);
export const importRecipe = (spoonacularId) => api.post(`/recipes/import/${spoonacularId}`);

// ── Meal Plans ────────────────────────────────────────────────────────────────
export const getMealPlanWeek = (date) => api.get(`/mealplans/week/${date}`);
export const getMealPlan = (id) => api.get(`/mealplans/${id}`);
export const updateMealPlanDayConfig = (id, data) => api.put(`/mealplans/${id}/dayconfig`, data);
export const updateMealPlanMeals = (id, data) => api.put(`/mealplans/${id}/meals`, data);
export const copyMealPlan = (targetId, sourceId) => api.post(`/mealplans/${targetId}/copy-from/${sourceId}`);
export const clearMealPlanMeals = (id) => api.delete(`/mealplans/${id}/meals`);
export const batchUpdateMealPlanMeals = (id, meals) => api.post(`/mealplans/${id}/meals/batch`, { meals });

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings = () => api.get('/settings');
export const updateSettings = (data) => api.put('/settings', data);
export const getCustodyTemplate = () => api.get('/settings/custody-template');
export const updateCustodyTemplate = (data) => api.put('/settings/custody-template', data);
export const getPantry = () => api.get('/settings/pantry');
export const addPantryItem = (data) => api.post('/settings/pantry', data);
export const deletePantryItem = (id) => api.delete(`/settings/pantry/${id}`);

// ── Ollama ────────────────────────────────────────────────────────────────────
export const getOllamaModels = () => api.get('/ollama/models');
export const testOllamaConnection = () => api.post('/ollama/test');

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiSuggestMealPlan = (id, data) => api.post(`/mealplans/${id}/ai-suggest`, data);
export const aiSuggestSlot = (id, data) => api.post(`/mealplans/${id}/ai-suggest-slot`, data);
export const estimateMacros = (data) => api.post('/recipes/estimate-macros', data);
export const aiSuggestRecipes = (prompt) => api.post('/recipes/ai-suggest', { prompt });
export const getBudgetInsight = () => api.get('/budget/insight');

// ── Nutrition ─────────────────────────────────────────────────────────────────
export const searchIngredient = (name) => api.get('/nutrition/ingredient', { params: { name } });
export const getNutritionByFdcId = (fdcId) => api.get(`/nutrition/fdcid/${fdcId}`);

// ── Grocery ───────────────────────────────────────────────────────────────────
export const getGroceryList = (mealPlanId) => api.get(`/grocery/${mealPlanId}`);
export const generateGroceryList = (mealPlanId) => api.post(`/grocery/${mealPlanId}/generate`);
export const updateGroceryItem = (listId, itemId, data) => api.put(`/grocery/${listId}/item/${itemId}`, data);
export const deleteGroceryItem = (listId, itemId) => api.delete(`/grocery/${listId}/item/${itemId}`);
export const logGrocerySpend = (listId, data) => api.post(`/grocery/${listId}/log-spend`, data);
export const getGroceryPrices = (listId) => api.get(`/grocery/${listId}/prices`);

// ── Budget ────────────────────────────────────────────────────────────────────
export const getBudgetSummary = () => api.get('/budget/summary');
export const getBudgetWeek = () => api.get('/budget/week');
export const getBudgetWeekly = () => api.get('/budget/weekly');

// ── Eating Out ────────────────────────────────────────────────────────────────
export const getEatingOutLogs = (params) => api.get('/eatingout', { params });
export const createEatingOutLog = (data) => api.post('/eatingout', data);
export const updateEatingOutLog = (id, data) => api.put(`/eatingout/${id}`, data);
export const deleteEatingOutLog = (id) => api.delete(`/eatingout/${id}`);

// ── Spoonacular quota ─────────────────────────────────────────────────────────
export const getSpoonacularQuota = () => api.get('/recipes/spoonacular-quota');

// ── Test connections ──────────────────────────────────────────────────────────
export const testKrogerConnection = () => api.post('/settings/test-kroger');
export const testSpoonacularConnection = (data) => api.post('/settings/test-spoonacular', data);
export const testUsdaConnection = (data) => api.post('/settings/test-usda', data);

// ── Password ──────────────────────────────────────────────────────────────────
export const changePassword = (data) => api.put('/auth/password', data);

// ── Account ───────────────────────────────────────────────────────────────────
export const register = (data) => api.post('/account/register', data);
export const forgotPassword = (data) => api.post('/account/forgot-password', data);
export const resetPassword = (data) => api.post('/account/reset-password', data);
export const deactivateAccount = (data) => api.post('/account/deactivate', data);
export const testSmtp = (data) => api.post('/account/smtp-test', data);

// ── Pantry Inventory ──────────────────────────────────────────────────────────
export const getPantryInventory = (params) => api.get('/pantry-inventory', { params });
export const scanBarcode = (barcode) => api.post('/pantry-inventory/scan', { barcode });
export const searchPantryProduct = (query) => api.post('/pantry-inventory/search', { query });
export const addPantryInventoryItem = (data) => api.post('/pantry-inventory', data);
export const updatePantryInventoryItem = (id, data) => api.put(`/pantry-inventory/${id}`, data);
export const deletePantryInventoryItem = (id) => api.delete(`/pantry-inventory/${id}`);
export const addPantryItemToPlan = (id, data) => api.post(`/pantry-inventory/${id}/add-to-plan`, data);

export default api;
