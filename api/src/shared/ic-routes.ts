import { getCampusUser } from './campus-user';
import { Hono } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  Variables,
  Enrollment,
  Assignment,
  AssignmentDetail,
  UserProfile,
  CourseGradeAPIResponse,
  ResponsiveScheduleSession,
  App,
} from '../types';
import { extractCourseGradeDetail, extractCourseGrades, getCourseTerms } from '../course-grades';
import { getGradeAvailability, canShowAssignmentFallback } from '../grade-availability';

export function createICRoutes(request: typeof fetch = (input, init) => fetch(input, init)) {
  return new Hono<{ Variables: Variables }>()
    .get('/user', async (c) => c.json(await getCampusUser(c.get('session').baseURL, request)))
    .get('/user/profile', async (c) => {
      const session = c.get('session');
      const baseUrl = session.baseURL;

      type GpaEntry = { type: string; gpa: string; unweighted: boolean };
      const formatGpa = (value: string | undefined) => {
        const gpa = value ? Number(value) : NaN;
        return Number.isFinite(gpa) ? gpa.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : null;
      };

      const gpaRes = await request(`https://${baseUrl}/api/campus/grading/gpas/my/gpa`, {
        headers: { Cookie: session.cookie },
      });

      let gpa: UserProfile['gpa'] = null;
      if (gpaRes.ok) {
        const gpaData = (await gpaRes.json()) as GpaEntry[];
        const cumulative = gpaData.filter((g) => g.type === 'Cumulative');
        const uw = formatGpa(cumulative.find((g) => g.unweighted)?.gpa);
        const w = formatGpa(cumulative.find((g) => !g.unweighted)?.gpa);
        if (uw || w) gpa = { uw, w };
      }

      return c.json({ gpa, absences: null, tardies: null } satisfies UserProfile);
    })
    .get('/user/appList', async (c) => {
      const session = c.get('session');
      const baseUrl = session.baseURL;
      const response = await request(`https://${baseUrl}/resources/apps?language=en`, {
        headers: {
          Cookie: session.cookie,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'User-Agent':
            'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        },
      });
      const data = (await response.json()) as App[];
      return c.json(data);
    })
    .get('/responsiveSchedule', async (c) => {
      const session = c.get('session');
      const sectionID = c.req.query('sectionID');
      const calendarID = c.req.query('calendarID');
      const structureID = c.req.query('structureID');

      if (!sectionID) {
        return c.json({ ok: false, message: 'sectionID is required' }, 400);
      }
      if (!calendarID) {
        return c.json({ ok: false, message: 'calendarID is required' }, 400);
      }

      const res = await request(
        `https://${session.baseURL}/resources/prism/portal/responsiveSchedule?calendarID=${calendarID}&personID=${session.personID}&structureID=${structureID}`,
        {
          headers: {
            Cookie: session.cookie,
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'User-Agent':
              'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          },
        }
      );

      if (res.status !== 200) {
        console.log('responsive schedule error: ', res.statusText);
        return c.json({ ok: false, message: res.statusText }, res.status as ContentfulStatusCode);
      }

      const data = (await res.json()) as ResponsiveScheduleSession[];
      return c.json(data);
    })
    .post('/responsiveSchedule/update', async (c) => {
      const session = c.get('session');
      const responsiveOfferingID = c.req.query('responsiveOfferingID');
      const calendarID = c.req.query('calendarID');
      const responsiveSessionID = c.req.query('responsiveSessionID');
      const personID = session.personID;
      const xsrfToken = session.cookie
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
        ?.slice('XSRF-TOKEN='.length);
      const origin = new URL(`https://${session.baseURL}`).origin;

      const response = await request(
        `https://${session.baseURL}/resources/prism/portal/responsiveSchedule/update`,
        {
          method: 'POST',
          body: JSON.stringify({
            calendarID: Number(calendarID),
            personID: Number(personID),
            responsiveOfferingID: Number(responsiveOfferingID),
            responsiveSessionID: Number(responsiveSessionID),
          }),
          headers: {
            Cookie: session.cookie,
            // IC requires browser origin headers as well as the CSRF cookie/header pair.
            ...(xsrfToken ? { 'x-xsrf-token': xsrfToken } : {}),
            Origin: origin,
            Referer: `https://${session.baseURL}/apps/portal/student/responsive-schedule`,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'User-Agent':
              'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          },
        }
      );
      const data = (await response.json()) as { success: boolean; message: string };
      if (!data.success) {
        return c.json({ ok: false, message: data.message }, 400);
      }
      return c.json({ ok: true, message: data.message });
    })
    .get('/courseGrades', async (c) => {
      const session = c.get('session');
      const baseUrl = session.baseURL;
      const preferredTermID = Number(c.req.query('termID')) || undefined;
      const preferredTaskID = Number(c.req.query('taskID')) || undefined;
      const response = await request(`https://${baseUrl}/resources/portal/grades`, {
        headers: { Cookie: session.cookie },
      });

      if (response.status !== 200) {
        return c.json('IC error: ' + response.statusText, response.status as ContentfulStatusCode);
      }

      const data = (await response.json()) as Enrollment[];
      const grades = extractCourseGrades(data, preferredTermID, preferredTaskID);
      return c.json(grades);
    })
    .get('/courseGrades/overview', async (c) => {
      const session = c.get('session');
      const response = await request(`https://${session.baseURL}/resources/portal/grades`, {
        headers: { Cookie: session.cookie },
      });
      if (!response.ok)
        return c.json({ message: response.statusText }, response.status as ContentfulStatusCode);
      const enrollments = (await response.json()) as Enrollment[];
      const courses = extractCourseGrades(
        enrollments,
        Number(c.req.query('termID')) || undefined,
        Number(c.req.query('taskID')) || undefined
      );
      // Keep the existing array endpoint compatible with already released clients.
      return c.json({
        courses,
        availability: getGradeAvailability(enrollments),
        assignmentFallbackAllowed: canShowAssignmentFallback(enrollments),
      });
    })
    .get('/courseGrades/terms', async (c) => {
      const session = c.get('session');
      const response = await request(`https://${session.baseURL}/resources/portal/grades`, {
        headers: { Cookie: session.cookie },
      });

      if (response.status !== 200) {
        return c.json('IC error: ' + response.statusText, response.status as ContentfulStatusCode);
      }

      const data = (await response.json()) as Enrollment[];
      return c.json(getCourseTerms(data));
    })
    .get('/courseGrades/:sectionID', async (c) => {
      const session = c.get('session');
      const sectionID = c.req.param('sectionID');
      const preferredTermID = Number(c.req.query('termID')) || undefined;
      const preferredTaskID = Number(c.req.query('taskID')) || undefined;
      const response = await request(
        `https://${session.baseURL}/resources/portal/grades/detail/${sectionID}`,
        {
          headers: { Cookie: session.cookie },
        }
      );

      if (response.status !== 200) {
        return c.json(
          { ok: false, message: response.statusText },
          response.status as ContentfulStatusCode
        );
      }

      const data = (await response.json()) as CourseGradeAPIResponse;
      const result = extractCourseGradeDetail(data, preferredTermID, preferredTaskID);

      if (!result) {
        return c.json({ ok: false, message: 'No grade detail found' }, 404);
      }
      return c.json(result);
    })
    .get('/assignments', async (c) => {
      const session = c.get('session');
      const response = await request(`https://${session.baseURL}/api/portal/assignment/listView`, {
        headers: { Cookie: session.cookie },
      });

      if (response.status !== 200) {
        console.log('Failed to get assignments', response.statusText);
        return c.json(
          { ok: false, message: response.statusText },
          response.status as ContentfulStatusCode
        );
      }

      const data = (await response.json()) as Assignment[];
      const assignments: Assignment[] = data.map((a) => ({
        assignmentName: a.assignmentName,
        courseName: a.courseName,
        objectSectionID: a.objectSectionID,
        sectionID: a.sectionID,
        dueDate: a.dueDate,
        assignedDate: a.assignedDate,
        scoreModifiedDate: a.scoreModifiedDate,
        scorePoints: a.scorePoints,
        score: a.score,
        scorePercentage: a.scorePercentage,
        scoringType: a.scoringType ?? null,
        totalPoints: a.totalPoints,
        comments: a.comments,
        feedback: a.feedback,
        notGraded: a.notGraded,
      }));
      return c.json(assignments);
    })

    .get('/assignments/:objectSectionID', async (c) => {
      const session = c.get('session');
      const objectSectionID = c.req.param('objectSectionID');
      const response = await request(
        `https://${session.baseURL}/api/instruction/curriculum/section/content/${objectSectionID}?personID=${session.personID}`,
        {
          headers: { Cookie: session.cookie },
        }
      );

      if (response.status !== 200) {
        return c.json(
          { ok: false, message: response.statusText },
          response.status as ContentfulStatusCode
        );
      }

      const data = (await response.json()) as AssignmentDetail;
      const detail: AssignmentDetail = {
        curriculumAlignmentID: data.curriculumAlignmentID,
        sectionID: data.sectionID,
        startDate: data.startDate,
        endDate: data.endDate,
        active: data.active,
        objectID: data.objectID,
        notGraded: data.notGraded,
        modifiedDate: data.modifiedDate,
        releaseScoresTimeStamp: data.releaseScoresTimeStamp,
        gradingAlignments: data.gradingAlignments,
        curriculumContent: data.curriculumContent,
        submissions: data.submissions,
        scores: data.scores,
        hasRubricScores: data.hasRubricScores,
      };

      return c.json(detail);
    })
    .get('/attendance/:enrollmentID', async (c) => {
      const session = c.get('session');
      const enrollmentID = c.req.param('enrollmentID');
      const response = await request(
        `https://${session.baseURL}/resources/portal/attendance/${enrollmentID}`,
        {
          headers: { Cookie: session.cookie },
        }
      );
      if (response.status !== 200) {
        return c.json(
          { ok: false, message: 'IC error: ' + response.statusText },
          response.status as ContentfulStatusCode
        );
      }
      const data = (await response.json()) as any; //sorry
      // total absences and tardies are the sum across all courses in all terms
      let absences = 0;
      let tardies = 0;
      if (data && Array.isArray(data.terms)) {
        for (const term of data.terms) {
          if (Array.isArray(term.courses)) {
            for (const course of term.courses) {
              if (Array.isArray(course.absentList)) {
                absences += course.absentList.length;
              }
              if (Array.isArray(course.tardyList)) {
                tardies += course.tardyList.length;
              }
            }
          }
        }
      }
      return c.json({ absences, tardies });
    });
}
