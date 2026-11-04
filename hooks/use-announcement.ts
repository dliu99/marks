import type { Announcement } from '@/api/src/types';

// The standalone release has no hosted announcement dependency.
export function useAnnouncement() {
  return { data: null as Announcement | null, dismissAnnouncement: (_id: string) => {} };
}
