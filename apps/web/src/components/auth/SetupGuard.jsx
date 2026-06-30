import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSetupStatus } from '../../api/client.js';
import { SkeletonCard } from '../ui/Skeleton.jsx';

export default function SetupGuard({ children }) {
  const { data, isLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="w-full max-w-sm p-6">
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (data?.setupComplete) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
