import { useSyncExternalStore } from 'react';
import {
  getCourseOrder,
  getDefaultHomePage,
  getHiddenCourseIds,
  getPreferredTermID,
  getPreferredTaskID,
  getShowAssignmentPercentImpact,
  getShowCoursePercentImpact,
  storage,
} from '@/utils/storage';

function subscribePreference(key: string, onStoreChange: () => void) {
  const listener = storage.addOnValueChangedListener((changedKey) => {
    if (changedKey === key) {
      onStoreChange();
    }
  });

  return () => {
    listener.remove();
  };
}

export function usePreferences() {
  const showAssignmentPercentImpact = useSyncExternalStore(
    (onStoreChange) =>
      subscribePreference('preferences.showAssignmentPercentImpact', onStoreChange),
    getShowAssignmentPercentImpact,
    getShowAssignmentPercentImpact
  );
  const showCoursePercentImpact = useSyncExternalStore(
    (onStoreChange) => subscribePreference('preferences.showCoursePercentImpact', onStoreChange),
    getShowCoursePercentImpact,
    getShowCoursePercentImpact
  );
  const courseOrder = useSyncExternalStore(
    (onStoreChange) => subscribePreference('preferences.courseOrder', onStoreChange),
    getCourseOrder,
    getCourseOrder
  );
  const hiddenCourseIds = useSyncExternalStore(
    (onStoreChange) => subscribePreference('preferences.hiddenCourseIds', onStoreChange),
    getHiddenCourseIds,
    getHiddenCourseIds
  );
  const defaultHomePage = useSyncExternalStore(
    (onStoreChange) => subscribePreference('preferences.defaultHomePage', onStoreChange),
    getDefaultHomePage,
    getDefaultHomePage
  );
  const preferredTermID = useSyncExternalStore(
    (onStoreChange) => subscribePreference('preferences.preferredTermID', onStoreChange),
    getPreferredTermID,
    getPreferredTermID
  );
  const preferredTaskID = useSyncExternalStore(
    (onStoreChange) => subscribePreference('preferences.preferredTaskID', onStoreChange),
    getPreferredTaskID,
    getPreferredTaskID
  );
  return {
    courseOrder,
    defaultHomePage,
    hiddenCourseIds,
    preferredTermID,
    preferredTaskID,
    showAssignmentPercentImpact,
    showCoursePercentImpact,
  };
}
