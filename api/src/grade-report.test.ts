// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { extractCourseGradeDetail, extractCourseGrades } from './course-grades';
import { buildGradeReport, formatGradeReport } from './grade-report';

const AS_OF = new Date('2026-09-01T12:00:00Z');

async function loadSchoolYearFixture() {
  return await Bun.file(
    new URL('../fixtures/grade-report-school-year.json', import.meta.url)
  ).json();
}

describe('grade report', () => {
  test('uses the available semester grade when the current progress task is empty', async () => {
    const fixture = await loadSchoolYearFixture();
    const terms = fixture.enrollments[0].terms;
    Object.assign(terms[1].courses[0].gradingTasks[0], { score: null, percent: null });
    Object.assign(terms[2].courses[0].gradingTasks[0], { score: 'B', percent: 84.4 });

    expect(extractCourseGrades(fixture.enrollments, undefined, undefined, AS_OF)[0]).toMatchObject({
      score: 'B',
      percent: 84.4,
      taskName: 'Semester Grade',
    });
    // A manual progress-term selection must not borrow a different term's grade.
    expect(
      extractCourseGrades(fixture.enrollments, 201, undefined, AS_OF)[0].percent
    ).toBeUndefined();
  });

  test('keeps every assignment IC attaches to the selected semester task', async () => {
    const fixture = await loadSchoolYearFixture();
    const raw = fixture.details['2001'];
    const assignments = raw.details[1].categories[0].assignments;
    assignments.push({ ...assignments[0], objectSectionID: 9002, termIDs: [202] });
    assignments.push({ ...assignments[0], objectSectionID: 9003, termIDs: [] });
    for (const termID of [undefined, 202]) {
      const detail = extractCourseGradeDetail(raw, termID, 3, AS_OF);
      expect(
        detail.categories[0].assignments.map((assignment) => assignment.objectSectionID)
      ).toEqual([9001, 9002, 9003]);
    }
    expect(extractCourseGradeDetail(raw, 201, 2, AS_OF).categories).toEqual([]);
  });

  test('detects an empty card even when the populated detail uses a different task', async () => {
    const fixture = await loadSchoolYearFixture();
    Object.assign(fixture.enrollments[0].terms[1].courses[0].gradingTasks[0], {
      score: null,
      percent: null,
    });
    const raw = fixture.details['2001'];
    const report = buildGradeReport(
      {
        sessionRef: fixture.sessionRef,
        district: fixture.district,
        enrollments: fixture.enrollments,
        detailsBySection: new Map([
          [
            2001,
            {
              raw,
              displayed: extractCourseGradeDetail(raw, undefined, undefined, AS_OF),
            },
          ],
        ]),
      },
      { now: AS_OF }
    );
    expect(report.issues.map((issue) => issue.code)).toContain('AVAILABLE_GRADE_NOT_DISPLAYED');
  });

  test('renders the same automatic course and paired-term detail used by the app', async () => {
    const fixture = await loadSchoolYearFixture();
    const rawDetail = fixture.details['2001'];
    const displayedDetail = extractCourseGradeDetail(rawDetail, undefined, undefined, AS_OF);
    const report = buildGradeReport(
      {
        sessionRef: fixture.sessionRef,
        district: fixture.district,
        user: fixture.user,
        enrollments: fixture.enrollments,
        assignments: fixture.assignments,
        detailsBySection: new Map([[2001, { raw: rawDetail, displayed: displayedDetail }]]),
      },
      { now: AS_OF }
    );

    expect(report.automaticTermIDs).toEqual([201]);
    expect(report.gradingTermIDs).toEqual([201, 202]);
    expect(report.courses.map((course) => course.courseName)).toEqual(['Biology']);
    expect(displayedDetail?.task).toMatchObject({
      termID: 202,
      taskName: 'Semester Grade',
    });
    expect(displayedDetail?.categories[0].assignments).toHaveLength(1);
    expect(report.issues.map((issue) => issue.code)).toEqual(['NO_ISSUES_FOUND']);

    const text = formatGradeReport(report);
    expect(text).toContain('Biology — A (95%)');
    expect(text).toContain('Quarter 2 · Semester Grade');
    expect(text).toContain('Lab Safety Quiz | 9/10 (90%)');
    expect(text).not.toContain('Sample Student');
  });

  test('flags a current course that the app omits because IC returned no grading tasks', () => {
    const report = buildGradeReport(
      {
        sessionRef: 'fixture',
        district: 'fixture.local',
        enrollments: [
          {
            enrollmentID: 1,
            terms: [
              {
                termID: 1,
                termName: 'Quarter 1',
                termSeq: 1,
                calendarID: 1,
                startDate: '2026-08-01',
                endDate: '2026-10-01',
                courses: [
                  {
                    courseName: 'New Course',
                    teacherDisplay: 'Teacher',
                    sectionID: 10,
                    structureID: 1,
                    dropped: false,
                    gradingTasks: [],
                  },
                ],
              },
            ],
          },
        ],
        detailsBySection: new Map(),
      },
      { now: AS_OF }
    );

    expect(report.courses).toEqual([]);
    expect(report.issues.map((issue) => issue.code)).toContain('COURSE_OMITTED_NO_TASKS');
    expect(report.issues.map((issue) => issue.code)).toContain('EMPTY_APP_COURSE_LIST');
  });
});

describe('quarter-graded district fixture', () => {
  async function loadQuarterFixture() {
    return await Bun.file(
      new URL('../fixtures/grade-report-quarter-terms.json', import.meta.url)
    ).json();
  }

  test.each(['2026-09-28', '2026-10-20', '2027-01-10'])(
    'reports no structural issues on %s',
    async (date) => {
      const fixture = await loadQuarterFixture();
      const now = new Date(`${date}T12:00:00Z`);
      const report = buildGradeReport(
        {
          sessionRef: fixture.sessionRef,
          district: fixture.district,
          enrollments: fixture.enrollments,
          assignments: fixture.assignments,
          detailsBySection: new Map(
            Object.entries(fixture.details).map(([sectionID, raw]) => [
              Number(sectionID),
              { raw, displayed: extractCourseGradeDetail(raw, undefined, undefined, now) },
            ])
          ),
        },
        { now }
      );
      expect(report.issues.map((issue) => issue.code)).toEqual(['NO_ISSUES_FOUND']);
    }
  );

  test('shows the first quarter task and its assignments', async () => {
    const fixture = await loadQuarterFixture();
    const now = new Date('2026-09-28T12:00:00Z');
    const [chemistry, band] = extractCourseGrades(fixture.enrollments, undefined, undefined, now);
    expect(chemistry).toMatchObject({ termName: 'Qtr 1', taskName: 'Quarter', percent: 91.2 });
    expect(band).toMatchObject({ taskName: 'Quarter', score: 'P' });
    const detail = extractCourseGradeDetail(fixture.details['4001'], undefined, undefined, now);
    expect(detail.task).toMatchObject({ taskName: 'Quarter', termID: 301 });
    expect(detail.categories[0].assignments).toHaveLength(2);
  });
});
