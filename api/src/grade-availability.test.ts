// @ts-nocheck
import { expect, test } from 'bun:test';
import { getGradeAvailability, canShowAssignmentFallback } from './grade-availability';
import { buildGradeReport } from './grade-report';
import { extractCourseGradeDetail } from './course-grades';

test('empty IC detail arrays resolve to unavailable without crashing', () => {
  expect(extractCourseGradeDetail([])).toBeNull();
});

test('explicit disabled gradebook is an informational state, not a missing-term error', () => {
  const enrollments = [
    { enrollmentID: 1, terms: null, gradesEnabled: false, assignmentsEnabled: false },
  ];
  expect(getGradeAvailability(enrollments)).toEqual({
    gradesEnabled: false,
    assignmentsEnabled: false,
  });
  expect(canShowAssignmentFallback(enrollments)).toBe(false);
  const report = buildGradeReport({
    sessionRef: 'fixture',
    district: 'example',
    enrollments,
    detailsBySection: new Map(),
  });
  expect(report.issues).toEqual([
    expect.objectContaining({ code: 'GRADEBOOK_DISABLED', severity: 'info' }),
  ]);
});

test('missing capability flags remain unknown and missing terms still trigger diagnostics', () => {
  const enrollments = [{ enrollmentID: 1, terms: [] }];
  expect(getGradeAvailability(enrollments)).toEqual({
    gradesEnabled: null,
    assignmentsEnabled: null,
  });
  expect(canShowAssignmentFallback(enrollments)).toBe(false);
  expect(
    buildGradeReport({
      sessionRef: 'fixture',
      district: 'example',
      enrollments,
      detailsBySection: new Map(),
    }).issues[0].code
  ).toBe('NO_TERMS');
});

test('assignment fallback requires explicit permission for every enrollment', () => {
  expect(canShowAssignmentFallback([])).toBe(false);
  expect(canShowAssignmentFallback([{ assignmentsEnabled: true }])).toBe(true);
  expect(
    canShowAssignmentFallback([{ assignmentsEnabled: true }, { assignmentsEnabled: false }])
  ).toBe(false);
  expect(canShowAssignmentFallback([{ assignmentsEnabled: true }, {}])).toBe(false);
});
