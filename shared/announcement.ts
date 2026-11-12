import { z } from 'zod';
import type { Announcement } from '../api/src/types';
import { fetchWithTimeout } from '../api/src/shared/fetch-timeout';

const announcementSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  message: z.string(),
  kind: z.enum(['info', 'release', 'warning']),
  ctaLabel: z.string().optional(),
  ctaUrl: z
    .url()
    .refine((value) => new URL(value).protocol === 'https:')
    .optional(),
  dismissible: z.boolean(),
});

export async function loadAnnouncement(
  apiURL: string | undefined,
  version: string,
  network: typeof fetch,
  signal?: AbortSignal
): Promise<Announcement | null> {
  if (!apiURL) return null;
  try {
    const url = new URL(`${apiURL.replace(/\/$/, '')}/announcement`);
    url.searchParams.set('version', version);
    const response = await fetchWithTimeout(
      network,
      url,
      { signal: signal as RequestInit['signal'], credentials: 'omit' },
      5000
    );
    if (!response.ok) return null;
    const parsed = announcementSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    // Announcements are optional; service outages must not affect school access.
    return null;
  }
}
