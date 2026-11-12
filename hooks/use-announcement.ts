import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { loadAnnouncement } from '@/shared/announcement';
import { dismissAnnouncement, isAnnouncementDismissed } from '@/utils/storage';

export function useAnnouncement() {
  const queryClient = useQueryClient();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const queryKey = ['announcement', version];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      loadAnnouncement(process.env.EXPO_PUBLIC_API_URL, version, expoFetch as typeof fetch, signal),
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  return {
    ...query,
    data: query.data && !isAnnouncementDismissed(query.data.id) ? query.data : null,
    dismissAnnouncement: (id: string) => {
      dismissAnnouncement(id);
      queryClient.setQueryData(queryKey, null);
    },
  };
}
