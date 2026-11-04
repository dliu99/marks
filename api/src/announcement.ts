import { Hono } from 'hono';
import type { Announcement } from './types';

type ReleaseAnnouncement = Announcement & {
  enabled: boolean;
  latestVersion?: string;
};

const announcement = new Hono();

const CURRENT_ANNOUNCEMENT: ReleaseAnnouncement = {
  id: '1.1.5-release',
  title: 'New update available',
  message: 'A new version of Marks is available.',
  kind: 'release',
  ctaLabel: 'Update',
  dismissible: false,
  enabled: false,
  latestVersion: '1.1.5',
};

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

announcement.get('/', (c) => {
  if (!CURRENT_ANNOUNCEMENT.enabled) {
    return c.json(null);
  }

  const appVersion = c.req.query('version');
  if (
    CURRENT_ANNOUNCEMENT.latestVersion &&
    appVersion &&
    compareVersions(appVersion, CURRENT_ANNOUNCEMENT.latestVersion) >= 0
  ) {
    return c.json(null);
  }

  const {
    enabled: _enabled,
    latestVersion: _latestVersion,
    ...publicAnnouncement
  } = CURRENT_ANNOUNCEMENT;

  return c.json(publicAnnouncement);
});

export default announcement;
