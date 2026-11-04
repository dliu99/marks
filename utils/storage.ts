import { clearCampusSession } from './campus-session';
import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({
  id: 'marks-storage',
});

const INITIAL_REVIEW_ATTEMPTED_KEY = 'review.initialDashboardAttempted';
const LAST_REVIEW_ATTEMPT_AT_KEY = 'review.lastAttemptAt';
const SHOW_ASSIGNMENT_PERCENT_IMPACT_KEY = 'preferences.showAssignmentPercentImpact';
const SHOW_COURSE_PERCENT_IMPACT_KEY = 'preferences.showCoursePercentImpact';
const COURSE_ORDER_KEY = 'preferences.courseOrder';
const HIDDEN_COURSE_IDS_KEY = 'preferences.hiddenCourseIds';
const PREFERRED_TERM_ID_KEY = 'preferences.preferredTermID';
const PREFERRED_TASK_ID_KEY = 'preferences.preferredTaskID';
const DISMISSED_ANNOUNCEMENT_PREFIX = 'announcement.dismissed.';
const DEFAULT_HOME_PAGE_KEY = 'preferences.defaultHomePage';
let cachedCourseOrderRaw: string | null | undefined;
let cachedCourseOrderValue: number[] = [];
let cachedHiddenCourseIdsRaw: string | null | undefined;
let cachedHiddenCourseIdsValue: number[] = [];

export type DefaultHomePage = 'dashboard' | 'grades';

export function getAuthSession(): { uuid: string; sessionToken: string } | null {
  const uuid = storage.getString('uuid');
  const sessionToken = storage.getString('sessionToken');

  if (!uuid || !sessionToken) {
    return null;
  }

  return { uuid, sessionToken };
}

export async function clearAuth(): Promise<void> {
  clearCampusSession();
  storage.remove('uuid');
  storage.remove('sessionToken');
  const { signOutCampusCookies } = await import('./campus-auth');
  await signOutCampusCookies().catch(() => {});
}

export function getInitialReviewAttempted(): boolean {
  return storage.getBoolean(INITIAL_REVIEW_ATTEMPTED_KEY) ?? false;
}

export function setInitialReviewAttempted(value: boolean): void {
  storage.set(INITIAL_REVIEW_ATTEMPTED_KEY, value);
}

export function getLastReviewAttemptAt(): number | null {
  return storage.getNumber(LAST_REVIEW_ATTEMPT_AT_KEY) ?? null;
}

export function setLastReviewAttemptAt(timestamp: number): void {
  storage.set(LAST_REVIEW_ATTEMPT_AT_KEY, timestamp);
}

export function getShowAssignmentPercentImpact(): boolean {
  return storage.getBoolean(SHOW_ASSIGNMENT_PERCENT_IMPACT_KEY) ?? false;
}

export function setShowAssignmentPercentImpact(value: boolean): void {
  storage.set(SHOW_ASSIGNMENT_PERCENT_IMPACT_KEY, value);
}

export function getShowCoursePercentImpact(): boolean {
  return storage.getBoolean(SHOW_COURSE_PERCENT_IMPACT_KEY) ?? true;
}

export function setShowCoursePercentImpact(value: boolean): void {
  storage.set(SHOW_COURSE_PERCENT_IMPACT_KEY, value);
}

export function getDefaultHomePage(): DefaultHomePage {
  const value = storage.getString(DEFAULT_HOME_PAGE_KEY);

  return value === 'dashboard' ? 'dashboard' : 'grades';
}

export function setDefaultHomePage(value: DefaultHomePage): void {
  storage.set(DEFAULT_HOME_PAGE_KEY, value);
}

export function getDefaultHomePath(): '/dashboard' | '/grades' {
  return getDefaultHomePage() === 'grades' ? '/grades' : '/dashboard';
}

export function getCourseOrder(): number[] {
  const rawValue = storage.getString(COURSE_ORDER_KEY);

  if (rawValue === cachedCourseOrderRaw) {
    return cachedCourseOrderValue;
  }

  if (!rawValue) {
    cachedCourseOrderRaw = rawValue;
    cachedCourseOrderValue = [];
    return cachedCourseOrderValue;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      cachedCourseOrderRaw = rawValue;
      cachedCourseOrderValue = [];
      return cachedCourseOrderValue;
    }

    cachedCourseOrderRaw = rawValue;
    cachedCourseOrderValue = parsed.filter((value): value is number => typeof value === 'number');
    return cachedCourseOrderValue;
  } catch {
    cachedCourseOrderRaw = rawValue;
    cachedCourseOrderValue = [];
    return cachedCourseOrderValue;
  }
}

export function setCourseOrder(sectionIds: number[]): void {
  storage.set(COURSE_ORDER_KEY, JSON.stringify(sectionIds));
}

export function getHiddenCourseIds(): number[] {
  const rawValue = storage.getString(HIDDEN_COURSE_IDS_KEY);

  if (rawValue === cachedHiddenCourseIdsRaw) {
    return cachedHiddenCourseIdsValue;
  }

  if (!rawValue) {
    cachedHiddenCourseIdsRaw = rawValue;
    cachedHiddenCourseIdsValue = [];
    return cachedHiddenCourseIdsValue;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      cachedHiddenCourseIdsRaw = rawValue;
      cachedHiddenCourseIdsValue = [];
      return cachedHiddenCourseIdsValue;
    }

    cachedHiddenCourseIdsRaw = rawValue;
    cachedHiddenCourseIdsValue = parsed.filter(
      (value): value is number => typeof value === 'number'
    );
    return cachedHiddenCourseIdsValue;
  } catch {
    cachedHiddenCourseIdsRaw = rawValue;
    cachedHiddenCourseIdsValue = [];
    return cachedHiddenCourseIdsValue;
  }
}

export function setHiddenCourseIds(sectionIds: number[]): void {
  storage.set(HIDDEN_COURSE_IDS_KEY, JSON.stringify(sectionIds));
}

export function getPreferredTermID(): number | null {
  return storage.getNumber(PREFERRED_TERM_ID_KEY) ?? null;
}

export function setPreferredTermID(termID: number | null): void {
  if (termID === null) {
    storage.remove(PREFERRED_TERM_ID_KEY);
    return;
  }

  storage.set(PREFERRED_TERM_ID_KEY, termID);
}

export function getPreferredTaskID(): number | null {
  return storage.getNumber(PREFERRED_TASK_ID_KEY) ?? null;
}

export function setPreferredTaskID(taskID: number | null): void {
  if (taskID === null) {
    storage.remove(PREFERRED_TASK_ID_KEY);
    return;
  }

  storage.set(PREFERRED_TASK_ID_KEY, taskID);
}

export function isAnnouncementDismissed(id: string): boolean {
  return storage.getBoolean(`${DISMISSED_ANNOUNCEMENT_PREFIX}${id}`) ?? false;
}

export function dismissAnnouncement(id: string): void {
  storage.set(`${DISMISSED_ANNOUNCEMENT_PREFIX}${id}`, true);
}

export type AuthRefreshStatus = 'authenticated' | 'unauthenticated' | 'expired' | 'error';

export async function refreshAuthSession(): Promise<AuthRefreshStatus> {
  const { restoreCampusSession } = await import('./campus-auth');
  return restoreCampusSession();
}

export async function verifyAndRefreshAuth(): Promise<boolean> {
  return (await refreshAuthSession()) === 'authenticated';
}
