import { extractCourseGrades } from './course-grades';
import type { App, Enrollment, ResponsiveScheduleSession } from './types';

export type ScheduleAudit = {
  available?: boolean;
  context?: { sectionID: number; calendarID: number; structureID: number };
  sessions?: ResponsiveScheduleSession[];
  issues: { severity: 'warning' | 'error'; code: string; message: string }[];
};

export async function auditResponsiveSchedule(
  enrollments: Enrollment[],
  fetchJson: <T>(path: string) => Promise<T>,
  personID: number,
  termID?: number,
  taskID?: number,
  now = new Date()
): Promise<ScheduleAudit> {
  const result: ScheduleAudit = { issues: [] };
  try {
    const apps = await fetchJson<App[]>('/resources/apps?language=en');
    result.available = apps.some((app) =>
      app.tools?.some((tool) => tool.code === 'student.responsive-schedule' && tool.display)
    );
    if (!result.available) return result;
    const course = extractCourseGrades(enrollments, termID, taskID, now)[0];
    if (!course?.sectionID || !course.calendarID || !course.structureID) {
      result.issues.push({
        severity: 'error',
        code: 'SCHEDULE_CONTEXT_MISSING',
        message:
          'Responsive Schedule is enabled, but the first grade course supplies no usable schedule context.',
      });
      return result;
    }
    result.context = {
      sectionID: course.sectionID,
      calendarID: course.calendarID,
      structureID: course.structureID,
    };
    const current = extractCourseGrades(enrollments, undefined, undefined, now)[0];
    if (
      current &&
      (current.calendarID !== course.calendarID || current.structureID !== course.structureID)
    ) {
      result.issues.push({
        severity: 'warning',
        code: 'SCHEDULE_CONTEXT_DIFFERS_FROM_AUTOMATIC',
        message:
          'The grade preference changes the calendar or structure used to request Responsive Schedule.',
      });
    }
    const query = new URLSearchParams({
      calendarID: String(course.calendarID),
      structureID: String(course.structureID),
      personID: String(personID),
    });
    result.sessions = await fetchJson<ResponsiveScheduleSession[]>(
      `/resources/prism/portal/responsiveSchedule?${query}`
    );
    if (!Array.isArray(result.sessions)) throw new Error('Expected a schedule session array');
    for (const session of result.sessions) {
      if (!Array.isArray(session.offerings)) throw new Error('Expected an offerings array');
    }
  } catch (error) {
    result.sessions = undefined;
    result.issues.push({
      severity: 'error',
      code: 'SCHEDULE_FETCH_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return result;
}

export function scheduleSummary(schedule: ScheduleAudit) {
  return `schedule=${schedule.available === false ? 'unavailable' : schedule.sessions ? `${schedule.sessions.length} sessions/${schedule.sessions.reduce((n, s) => n + s.offerings.length, 0)} offerings` : 'failed'}`;
}

export function formatSchedule(schedule: ScheduleAudit) {
  const lines = ['RESPONSIVE SCHEDULE', scheduleSummary(schedule)];
  if (schedule.context)
    lines.push(
      `Context: section ${schedule.context.sectionID}, calendar ${schedule.context.calendarID}, structure ${schedule.context.structureID}`
    );
  for (const [index, session] of (schedule.sessions ?? []).entries()) {
    lines.push(
      `${session.sessionName} [${session.responsiveSessionID}]${index === 0 ? ' [DEFAULT]' : ''} | ${session.startDate} to ${session.endDate} | ${session.sessionOpen ? 'open' : 'closed'}`
    );
    const offerings = [...session.offerings].sort(
      (a, b) =>
        Number(b.rosterID !== 0) - Number(a.rosterID !== 0) || b.currentStudents - a.currentStudents
    );
    for (const offering of offerings)
      lines.push(
        `  ${offering.responsiveOfferingName} | ${offering.teacherDisplay} | room ${offering.roomName} | ${offering.currentStudents}/${offering.maxStudents}${offering.rosterID !== 0 ? ' [SAVED]' : ''}${offering.teacherRequest ? ' [TEACHER REQUEST]' : ''}`
      );
  }
  return lines.join('\n');
}
