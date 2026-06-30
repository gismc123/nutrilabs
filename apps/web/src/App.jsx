import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import RequireAuth from './components/auth/RequireAuth.jsx';
import SetupGuard from './components/auth/SetupGuard.jsx';
import AppShell from './components/layout/AppShell.jsx';

import Setup from './pages/Setup.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WeekPlanner from './pages/WeekPlanner.jsx';
import RecipeLibrary from './pages/RecipeLibrary.jsx';
import GroceryList from './pages/GroceryList.jsx';
import BudgetTracker from './pages/BudgetTracker.jsx';
import Settings from './pages/Settings.jsx';
import PantryInventory from './pages/PantryInventory.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsOfUse from './pages/TermsOfUse.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/setup"
            element={
              <SetupGuard>
                <Setup />
              </SetupGuard>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfUse />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="plan" element={<WeekPlanner />} />
            <Route path="recipes" element={<RecipeLibrary />} />
            <Route path="shop" element={<GroceryList />} />
            <Route path="budget" element={<BudgetTracker />} />
            <Route path="settings" element={<Settings />} />
            <Route path="pantry" element={<PantryInventory />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    </QueryClientProvider>
  );
}
