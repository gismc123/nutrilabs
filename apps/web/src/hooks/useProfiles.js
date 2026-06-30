import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProfiles,
  createProfile as createProfileApi,
  updateProfile as updateProfileApi,
  deleteProfile as deleteProfileApi,
} from '../api/client.js';

export function useProfiles() {
  const queryClient = useQueryClient();

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['profiles'] });

  const createProfileMutation = useMutation({
    mutationFn: createProfileApi,
    onSuccess: invalidate,
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, data }) => updateProfileApi(id, data),
    onSuccess: invalidate,
  });

  const deleteProfileMutation = useMutation({
    mutationFn: deleteProfileApi,
    onSuccess: invalidate,
  });

  return {
    profiles: profiles ?? [],
    isLoading,
    createProfile: createProfileMutation.mutate,
    updateProfile: updateProfileMutation.mutate,
    deleteProfile: deleteProfileMutation.mutate,
  };
}
