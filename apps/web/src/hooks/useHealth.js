import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api/client.js';

export function useHealth() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  });

  return { health: health ?? null, isLoading };
}
