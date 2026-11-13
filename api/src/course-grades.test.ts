// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import {
  extractCourseGradeDetail,
  extractCourseGrades,
  getAutomaticGradingTermIDs,
  getAutomaticTermIDs,
  getCourseTerms,
  isPinnedTermSuperseded,
} from './course-grades';
import type { Course, Enrollment, Term } from './types';

const term = (
  termID: number,
  termSeq: number,
  startDate: string,
  endDate: string,
  calendarID = 20
) => ({
  calendarID,
  termID,
  termSeq,
  startDate,
  endDate,
});

const course = (sectionID: number, courseName: string, withGrade: boolean): Course => ({
  sectionID,
  courseName,
  teacherDisplay: 'Teacher',
  structureID: 1,
  dropped: false,
  gradingTasks: [
    {
      taskID: 1,
      taskName: 'Progress Grade',
      hasAssignments: withGrade,
      hasDetail: withGrade,
      score: withGrade ? 'A' : null,
      percent: withGrade ? 95 : null,
    },
  ],
});

const assignmentCourse = (sectionID: number, courseName: string): Course => ({
  ...course(sectionID, courseName, false),
  gradingTasks: [
    {
      taskID: 3,
      taskName: 'Semester Grade',
      hasAssignments: true,
      hasDetail: true,
      score: null,
      percent: null,
    },
  ],
});

const enrollmentTerm = (
  termID: number,
  termSeq: number,
  startDate: string,
  endDate: string,
  courses: Course[],
  calendarID: number
): Term => ({
  termID,
  termName: `T${termSeq}`,
  termSeq,
  calendarID,
  startDate,
  endDate,
  courses,
});

describe('automatic term selection', () => {
  const terms = [
    term(101, 4, '2026-03-23', '2026-06-04', 10),
    term(201, 1, '2026-08-13', '2026-10-09'),
    term(202, 2, '2026-10-12', '2026-12-18'),
  ];

  test('uses the active term across school years', () => {
    expect(getAutomaticTermIDs(terms, new Date('2026-08-16T12:00:00Z'))).toEqual([201]);
  });

  test('uses the next published term during summer', () => {
    expect(getAutomaticTermIDs(terms, new Date('2026-07-01T12:00:00Z'))).toEqual([201]);
  });

  test('uses the next term during a short term gap', () => {
    expect(getAutomaticTermIDs(terms, new Date('2026-10-10T12:00:00Z'))).toEqual([202]);
  });

  test('falls back to the most recently ended term when no future term is published', () => {
    expect(getAutomaticTermIDs(terms, new Date('2027-01-01T12:00:00Z'))).toEqual([202]);
  });

  test('keeps concurrent terms from multiple calendars', () => {
    expect(
      getAutomaticTermIDs(
        [
          term(201, 1, '2026-08-13', '2026-10-09', 20),
          term(301, 1, '2026-08-01', '2026-12-01', 30),
        ],
        new Date('2026-08-16T12:00:00Z')
      )
    ).toEqual([201, 301]);
  });

  const withAssignmentTask = (dated) => ({
    ...dated,
    courses: [{ sectionID: 1, gradingTasks: [{ taskID: 3, hasAssignments: true }] }],
  });

  test('includes the next term when its task already collects assignments', () => {
    expect(
      getAutomaticGradingTermIDs(
        [terms[0], terms[1], withAssignmentTask(terms[2])],
        new Date('2026-08-16T12:00:00Z')
      )
    ).toEqual([201, 202]);
  });

  test('keeps a term to itself when the next term does not collect its assignments', () => {
    expect(getAutomaticGradingTermIDs(terms, new Date('2026-08-16T12:00:00Z'))).toEqual([201]);
  });

  test('does not pair a term with the same sequence from another school year', () => {
    expect(
      getAutomaticGradingTermIDs(
        [
          term(101, 1, '2025-08-13', '2025-10-10', 10),
          withAssignmentTask(term(102, 2, '2025-10-13', '2025-12-19', 10)),
          term(201, 1, '2026-08-13', '2026-10-09', 20),
          withAssignmentTask(term(202, 2, '2026-10-12', '2026-12-18', 20)),
        ],
        new Date('2026-08-16T12:00:00Z')
      )
    ).toEqual([201, 202]);
  });

  test('does not pull the previous term into a term that grades its own assignments', () => {
    // Trimester or quarter calendars where every term has its own gradebook.
    const trimesters = [
      withAssignmentTask(term(401, 1, '2026-08-20', '2026-11-20', 40)),
      withAssignmentTask(term(402, 2, '2026-11-30', '2027-03-05', 40)),
      term(403, 3, '2027-03-15', '2027-06-04', 40),
    ];
    expect(getAutomaticGradingTermIDs(trimesters, new Date('2026-12-10T12:00:00Z'))).toEqual([402]);
  });
});

describe('course extraction', () => {
  const enrollments: Enrollment[] = [
    {
      enrollmentID: 1,
      terms: [
        enrollmentTerm(101, 4, '2026-03-23', '2026-06-04', [course(1001, 'Old Course', true)], 10),
        enrollmentTerm(201, 1, '2026-08-13', '2026-10-09', [course(2001, 'New Course', false)], 20),
        enrollmentTerm(
          202,
          2,
          '2026-10-12',
          '2026-12-18',
          [assignmentCourse(2001, 'New Course')],
          20
        ),
      ],
    },
  ];

  test('shows current courses before the first grade is posted', () => {
    const grades = extractCourseGrades(
      enrollments,
      undefined,
      undefined,
      new Date('2026-08-16T12:00:00Z')
    );

    expect(grades).toHaveLength(1);
    expect(grades[0]).toMatchObject({
      sectionID: 2001,
      courseName: 'New Course',
      termName: 'T1',
      score: undefined,
      percent: undefined,
      hasAssignments: true,
      hasDetail: true,
    });
  });

  test('shows a progress grade even when a newer assignment task has no grade', () => {
    const currentCourse: Course = {
      ...course(2002, 'Orchestra', false),
      gradingTasks: [
        {
          taskID: 2,
          taskName: 'Progress Grade',
          score: 'A',
          percent: null,
          hasAssignments: false,
          hasDetail: false,
          modifiedDate: '2026-09-14 10:39:00',
        },
        {
          taskID: 3,
          taskName: 'Quarter Grade',
          score: null,
          percent: null,
          hasAssignments: true,
          hasDetail: true,
        },
      ],
    };
    const grades = extractCourseGrades(
      [
        {
          enrollmentID: 1,
          terms: [enrollmentTerm(201, 1, '2026-08-13', '2026-10-09', [currentCourse], 20)],
        },
      ],
      undefined,
      undefined,
      new Date('2026-09-22T12:00:00Z')
    );

    expect(grades[0]).toMatchObject({
      score: 'A',
      taskName: 'Progress Grade',
      hasAssignments: true,
      hasDetail: true,
    });
  });

  test('includes the academic year returned in the enrollment label', () => {
    const terms = getCourseTerms([
      {
        enrollmentID: 1,
        displayName: '26-27 Example High',
        terms: [
          enrollmentTerm(
            201,
            1,
            '2026-08-13',
            '2026-10-09',
            [course(2001, 'New Course', false)],
            20
          ),
        ],
      },
    ]);

    expect(terms[0].academicYear).toBe('26-27');
  });

  test('still honors an explicitly selected historical term', () => {
    const grades = extractCourseGrades(enrollments, 101, 1, new Date('2026-08-16T12:00:00Z'));

    expect(grades.map((grade) => grade.courseName)).toEqual(['Old Course']);
  });
});

describe('district grading layouts', () => {
  const task = (taskID, taskName, fields = {}) => ({
    taskID,
    taskName,
    hasAssignments: false,
    hasDetail: false,
    score: null,
    percent: null,
    ...fields,
  });
  const section = (sectionID, gradingTasks) => ({
    sectionID,
    courseName: `Course ${sectionID}`,
    teacherDisplay: 'Teacher',
    structureID: 1,
    dropped: false,
    gradingTasks,
  });
  const quarters = (coursesBySeq) => [
    {
      enrollmentID: 1,
      terms: [
        ['2026-08-11', '2026-10-09'],
        ['2026-10-13', '2026-12-18'],
        ['2027-01-05', '2027-03-12'],
        ['2027-03-23', '2027-05-27'],
      ].map(([startDate, endDate], index) => ({
        termID: 301 + index,
        termName: `Qtr ${index + 1}`,
        termSeq: index + 1,
        calendarID: 30,
        startDate,
        endDate,
        courses: coursesBySeq[index] || [],
      })),
    },
  ];
  const graded = { hasAssignments: true, hasDetail: true };

  test('grades each quarter on its own task without task-name conventions', () => {
    const enrollments = quarters([
      [section(1, [task(11, 'Quarter', { ...graded, progressScore: '91', progressPercent: 91 })])],
      [section(1, [task(11, 'Quarter', { ...graded, progressScore: '84', progressPercent: 84 })])],
      [section(1, [task(11, 'Quarter', graded)])],
      [
        section(1, [
          task(11, 'Quarter'),
          task(12, 'Final', { hasDetail: true, progressPercent: 88 }),
        ]),
      ],
    ]);

    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-09-28T12:00:00Z'))[0]
    ).toMatchObject({ termName: 'Qtr 1', taskName: 'Quarter', percent: 91 });
    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-10-20T12:00:00Z'))[0]
    ).toMatchObject({ termName: 'Qtr 2', taskName: 'Quarter', percent: 84 });
    // Q3 must not borrow the year-long Final task from Q4 because of sequence pairing.
    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2027-01-20T12:00:00Z'))[0]
    ).toMatchObject({ termName: 'Qtr 3', taskName: 'Quarter', percent: undefined });
  });

  test('does not show last quarter grade when both quarters keep their own gradebook', () => {
    const enrollments = quarters([
      [section(1, [task(11, 'Marking Period', { ...graded, score: '93' })])],
      [section(1, [task(11, 'Marking Period', graded)])],
    ]);

    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-10-20T12:00:00Z'))[0]
    ).toMatchObject({ termName: 'Qtr 2', score: undefined });
  });

  test('carries a posted grade forward when the course has no assignment gradebook', () => {
    // SRVUSD posts progress grades on T1 for courses without assignments.
    const enrollments = quarters([
      [section(1, [task(1, 'Progress Grade', { score: 'A' })])],
      [section(1, [task(1, 'Progress Grade')])],
    ]);

    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-10-20T12:00:00Z'))[0]
    ).toMatchObject({ termName: 'Qtr 2', score: 'A' });
  });

  test('prefers an overall grade over a standards task', () => {
    const enrollments = quarters([
      [
        section(1, [
          task(20, 'Writing: Evidence', { standardID: 7, score: '4', modifiedDate: '2026-09-27' }),
          task(21, 'Posted Grade', { score: 'B+', modifiedDate: '2026-09-20' }),
        ]),
      ],
    ]);

    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-09-28T12:00:00Z'))[0]
    ).toMatchObject({ taskName: 'Posted Grade', score: 'B+' });
  });

  test('finds the task holding the active term assignments from assignment term tags', () => {
    const detailTerm = (termID, termSeq, startDate, endDate) => ({
      calendarID: 30,
      termID,
      termSeq,
      termName: `Qtr ${termSeq}`,
      startDate,
      endDate,
    });
    const detailTask = (taskID, taskName, termID, fields = {}) => ({
      task: { taskID, taskName, termID, termName: 'Qtr', termSeq: 1, ...fields },
      categories: [],
    });
    const assignment = (objectSectionID, termIDs) => ({
      objectSectionID,
      assignmentName: `Assignment ${objectSectionID}`,
      termIDs,
      score: '9',
      totalPoints: 10,
    });
    const raw = {
      terms: [
        detailTerm(301, 1, '2026-08-11', '2026-10-09'),
        detailTerm(302, 2, '2026-10-13', '2026-12-18'),
        detailTerm(303, 3, '2027-01-05', '2027-03-12'),
        detailTerm(304, 4, '2027-03-23', '2027-05-27'),
      ],
      details: [
        detailTask(11, 'Q1 Mark', 301, { hasDetail: true, modifiedDate: '2026-09-27 08:00:00' }),
        {
          ...detailTask(12, 'Year Grade', 304, {
            hasAssignments: true,
            hasDetail: true,
            modifiedDate: '2026-09-20 08:00:00',
          }),
          categories: [
            { groupID: 1, name: 'Work', weight: 0, assignments: [assignment(1, [301])] },
          ],
        },
        {
          ...detailTask(13, 'Last Year', 204, {
            hasAssignments: true,
            hasDetail: true,
            modifiedDate: '2026-09-28 08:00:00',
          }),
          categories: [{ groupID: 2, name: 'Old', weight: 0, assignments: [assignment(2, [204])] }],
        },
      ],
    };

    expect(
      extractCourseGradeDetail(raw, undefined, undefined, new Date('2026-09-28T12:00:00Z')).task
    ).toMatchObject({ taskName: 'Year Grade', termID: 304 });
  });

  test('shows a rubric course by its overall task, with every standard', () => {
    const standard = (taskID, taskName, fields = {}) =>
      task(taskID, taskName, { standardID: taskID, ...fields });
    const enrollments = quarters([
      [
        section(1, [
          standard(51, 'Build functions.', { ...graded, score: 'PR' }),
          standard(52, 'Interpret functions.', graded),
          task(60, 'Evidence Snapshot'),
        ]),
      ],
      [
        section(1, [
          standard(51, 'Build functions.', graded),
          task(61, '   Course Final', { hasDetail: true, score: 'B' }),
        ]),
      ],
    ]);

    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-09-28T12:00:00Z'))[0]
    ).toMatchObject({ taskName: 'Course Final', score: 'B', standardsBased: true });

    const rubric = (objectSectionID, termIDs = [301]) => ({
      objectSectionID,
      assignmentName: `Evidence ${objectSectionID}`,
      termIDs,
      score: 'PR',
      scoringType: 'r',
      totalPoints: null,
      multiplier: null,
    });
    const raw = {
      terms: [
        { calendarID: 30, termID: 301, termSeq: 1, startDate: '2026-08-11', endDate: '2026-10-09' },
        { calendarID: 30, termID: 302, termSeq: 2, startDate: '2026-10-13', endDate: '2026-12-18' },
      ],
      details: [
        {
          task: {
            taskID: 51,
            taskName: 'Build functions.',
            termID: 302,
            standardID: 51,
            hasAssignments: true,
            hasDetail: true,
            progressScore: 'PR',
            treeTraversalSeq: 1,
            modifiedDate: '2026-09-27 08:00:00',
          },
          categories: [
            { groupID: 1, name: 'Evidence', weight: 0, assignments: [rubric(1), rubric(2)] },
          ],
        },
        {
          task: {
            taskID: 52,
            taskName: ' Interpret functions.',
            termID: 302,
            standardID: 52,
            hasAssignments: true,
            hasDetail: true,
            progressScore: null,
            treeTraversalSeq: 2,
          },
          categories: [
            { groupID: 2, name: 'Evidence', weight: 0, assignments: [rubric(2), rubric(3)] },
          ],
        },
        {
          task: {
            taskID: 61,
            taskName: '   Course Final',
            termID: 302,
            hasAssignments: false,
            hasDetail: true,
            progressScore: 'B',
          },
          categories: [],
        },
      ],
    };
    const detail = extractCourseGradeDetail(
      raw,
      undefined,
      undefined,
      new Date('2026-09-28T12:00:00Z')
    );

    expect(detail.task).toMatchObject({ taskName: 'Course Final', progressScore: 'B' });
    expect(detail.categories).toHaveLength(1);
    expect(detail.categories[0].assignments.map((a) => a.objectSectionID)).toEqual([1, 2, 3]);
    expect(detail.categories[0].assignments[0]).toMatchObject({ totalPoints: 0, multiplier: 1 });
    expect(detail.standards).toEqual([
      { taskID: 51, taskName: 'Build functions.', score: 'PR', percent: null },
      { taskID: 52, taskName: 'Interpret functions.', score: null, percent: null },
    ]);
  });

  test('keeps a lone graded standard when the course has no overall task', () => {
    const enrollments = quarters([
      [section(1, [task(70, 'Content Literacy', { standardID: 70, score: 'P' })])],
    ]);

    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-09-28T12:00:00Z'))[0]
    ).toMatchObject({ taskName: 'Content Literacy', score: 'P' });
  });

  test('shows the running grade instead of a posted progress snapshot', () => {
    // SRVUSD/Dublin: teachers post a Progress Grade on T1 while IC calculates the
    // live semester grade on the T2 task that collects assignments.
    const enrollments = quarters([
      [
        section(1, [
          task(1, 'Progress Grade', { score: 'C', percent: 76, modifiedDate: '2026-09-14' }),
        ]),
      ],
      [
        section(1, [
          task(1, 'Progress Grade'),
          task(3, 'Semester Grade', {
            ...graded,
            progressScore: 'A',
            progressPercent: 94,
            modifiedDate: '2026-09-25',
          }),
        ]),
      ],
    ]);

    expect(
      extractCourseGrades(enrollments, undefined, undefined, new Date('2026-09-28T12:00:00Z'))[0]
    ).toMatchObject({ taskName: 'Semester Grade', score: 'A', percent: 94 });
    // A manually selected term still shows exactly that term's task.
    expect(
      extractCourseGrades(enrollments, 301, undefined, new Date('2026-09-28T12:00:00Z'))[0]
    ).toMatchObject({
      taskName: 'Progress Grade',
      score: 'C',
    });
  });
});

describe('isPinnedTermSuperseded', () => {
  const quarters = [
    term(301, 1, '2026-08-12', '2026-10-23'),
    term(302, 2, '2026-10-26', '2026-12-18'),
    term(303, 3, '2027-01-05', '2027-03-12'),
  ];

  test('a pinned term that ended while a newer term is in session is superseded', () => {
    expect(isPinnedTermSuperseded(quarters, 301, new Date('2026-11-12T12:00:00Z'))).toBe(true);
  });

  test('a pinned term still in session is kept, including its last day', () => {
    expect(isPinnedTermSuperseded(quarters, 301, new Date('2026-10-23T12:00:00Z'))).toBe(false);
    expect(isPinnedTermSuperseded(quarters, 302, new Date('2026-11-12T12:00:00Z'))).toBe(false);
  });

  test('a pinned term is kept during a break with no term in session', () => {
    expect(isPinnedTermSuperseded(quarters, 302, new Date('2026-12-28T12:00:00Z'))).toBe(false);
  });

  test('a pinned future term is kept', () => {
    expect(isPinnedTermSuperseded(quarters, 303, new Date('2026-11-12T12:00:00Z'))).toBe(false);
  });

  test('a pinned term that is no longer published is superseded by the term in session', () => {
    expect(isPinnedTermSuperseded(quarters, 999, new Date('2026-11-12T12:00:00Z'))).toBe(true);
  });

  test('nothing is superseded when no terms are returned', () => {
    expect(isPinnedTermSuperseded([], 301, new Date('2026-11-12T12:00:00Z'))).toBe(false);
  });
});
