// @ts-nocheck -- Bun tests are also included by the Worker-only tsconfig.
import { expect, test } from 'bun:test';
import { auditResponsiveSchedule, formatSchedule } from './responsive-schedule-report';

const now = new Date('2026-09-08');
const fixture = await Bun.file(
  new URL('../fixtures/grade-report-school-year.json', import.meta.url)
).json();
const apps = [{ tools: [{ code: 'student.responsive-schedule', display: true }] }];
const sessions = [
  {
    responsiveSessionID: 1,
    sessionName: 'Flex',
    startDate: 1,
    endDate: 2,
    sessionOpen: true,
    offerings: [],
  },
];

test('requests the same calendar and structure as the app and renders an empty session', async () => {
  const paths: string[] = [];
  const result = await auditResponsiveSchedule(
    fixture.enrollments,
    async <T>(path: string) => {
      paths.push(path);
      return (path.startsWith('/resources/apps') ? apps : sessions) as T;
    },
    123,
    undefined,
    undefined,
    now
  );
  expect(paths[1]).toContain('calendarID=20&structureID=2&personID=123');
  expect(result.issues).toEqual([]);
  expect(formatSchedule(result)).toContain('Flex [1] [DEFAULT]');
});

test('flags historical calendar selection', async () => {
  const result = await auditResponsiveSchedule(
    fixture.enrollments,
    async <T>(path: string) => (path.startsWith('/resources/apps') ? apps : sessions) as T,
    123,
    101,
    undefined,
    now
  );
  expect(result.context?.calendarID).toBe(10);
  expect(result.issues[0].code).toBe('SCHEDULE_CONTEXT_DIFFERS_FROM_AUTOMATIC');
});

test('reports missing grade context without requesting schedules', async () => {
  let calls = 0;
  const result = await auditResponsiveSchedule(
    [],
    async <T>() => {
      calls++;
      return apps as T;
    },
    123
  );
  expect(calls).toBe(1);
  expect(result.issues[0].code).toBe('SCHEDULE_CONTEXT_MISSING');
});

test('unavailable feature is not a failure and does not request schedules', async () => {
  let calls = 0;
  const result = await auditResponsiveSchedule(
    [],
    async <T>() => {
      calls++;
      return [] as T;
    },
    123
  );
  expect(calls).toBe(1);
  expect(result.available).toBe(false);
  expect(result.issues).toEqual([]);
});

test('captures schedule fetch failures', async () => {
  const result = await auditResponsiveSchedule(
    fixture.enrollments,
    async <T>(path: string) => {
      if (path.startsWith('/resources/apps')) return apps as T;
      throw new Error('IC returned 401 Unauthorized');
    },
    123,
    undefined,
    undefined,
    now
  );
  expect(result.issues[0].code).toBe('SCHEDULE_FETCH_FAILED');
});
