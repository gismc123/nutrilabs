import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import BottomNav from './BottomNav.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import ErrorBoundary from '../ui/ErrorBoundary.jsx';

export default function AppShell() {
  return (
    <div className="flex h-screen bg-neutral-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomNav />
      <ConfirmDialog />
    </div>
  );
}
