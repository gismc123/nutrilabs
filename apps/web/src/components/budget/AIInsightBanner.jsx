import { useQuery } from '@tanstack/react-query';
import { IconSparkles } from '@tabler/icons-react';
import { getBudgetInsight } from '../../api/client.js';
import { SkeletonText } from '../ui/Skeleton.jsx';

export default function AIInsightBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ['budget-insight'],
    queryFn: getBudgetInsight,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="bg-primary-50 rounded-xl p-4">
        <SkeletonText className="w-3/5" />
      </div>
    );
  }

  const insight = data?.insight;
  if (!insight) return null;

  return (
    <div className="flex items-start gap-3 bg-primary-50 border border-primary-100 rounded-xl p-4">
      <IconSparkles size={18} className="text-primary-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-primary-800">{insight}</p>
    </div>
  );
}
