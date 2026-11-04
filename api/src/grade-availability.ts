import type { Enrollment, GradeAvailability } from './types';

export function getGradeAvailability(enrollments: Enrollment[]): GradeAvailability {
  // Preserve unknown for older districts/responses that omit capability flags.
  const flag = (key: 'gradesEnabled' | 'assignmentsEnabled') => {
    if (enrollments.some((enrollment) => enrollment[key] === true)) return true;
    if (enrollments.length && enrollments.every((enrollment) => enrollment[key] === false))
      return false;
    return null;
  };
  return { gradesEnabled: flag('gradesEnabled'), assignmentsEnabled: flag('assignmentsEnabled') };
}

export function canShowAssignmentFallback(enrollments: Enrollment[]) {
  // Assignment rows have no enrollment ID; do not mix data from a disabled or
  // unknown enrollment into an explicitly enabled enrollment's fallback.
  return enrollments.length > 0 && enrollments.every((e) => e.assignmentsEnabled === true);
}
