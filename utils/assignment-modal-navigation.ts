import type { Router } from 'expo-router';

let isAssignmentModalTransitioning = false;
let assignmentReleaseTimer: ReturnType<typeof setTimeout> | null = null;
let isCourseModalTransitioning = false;
let courseReleaseTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAssignmentLockRelease() {
  if (assignmentReleaseTimer) {
    clearTimeout(assignmentReleaseTimer);
  }

  assignmentReleaseTimer = setTimeout(() => {
    isAssignmentModalTransitioning = false;
    assignmentReleaseTimer = null;
  }, 1500);
}

function scheduleCourseLockRelease() {
  if (courseReleaseTimer) {
    clearTimeout(courseReleaseTimer);
  }

  courseReleaseTimer = setTimeout(() => {
    isCourseModalTransitioning = false;
    courseReleaseTimer = null;
  }, 1500);
}

export function openAssignmentModal(
  router: Pick<Router, 'push'>,
  objectSectionID: number,
  assignmentName: string
) {
  if (isAssignmentModalTransitioning) {
    return false;
  }

  isAssignmentModalTransitioning = true;
  scheduleAssignmentLockRelease();

  router.push({
    pathname: '/(protected)/assignment-modal',
    params: {
      objectSectionID: objectSectionID.toString(),
      assignmentName,
    },
  });

  return true;
}

export function releaseAssignmentModalNavigationLock() {
  if (assignmentReleaseTimer) {
    clearTimeout(assignmentReleaseTimer);
    assignmentReleaseTimer = null;
  }

  isAssignmentModalTransitioning = false;
}

export function openCourseModal(
  router: Pick<Router, 'push'>,
  params: {
    sectionID: string;
    courseName: string;
    teacher: string;
    score: string;
    percent: string;
    termName: string;
    taskName: string;
  }
) {
  if (isCourseModalTransitioning) {
    return false;
  }

  isCourseModalTransitioning = true;
  scheduleCourseLockRelease();

  router.push({
    pathname: '/(protected)/(course)',
    params,
  });

  return true;
}

export function releaseCourseModalNavigationLock() {
  if (courseReleaseTimer) {
    clearTimeout(courseReleaseTimer);
    courseReleaseTimer = null;
  }

  isCourseModalTransitioning = false;
}
