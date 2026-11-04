import {
  extractCourseGrades,
  getAutomaticGradingTermIDs,
  getAutomaticTermIDs,
  getCourseTerms,
  getDetailGradingTermIDs,
} from './course-grades';
import { formatSchedule, scheduleSummary, type ScheduleAudit } from './responsive-schedule-report';
import { getGradeAvailability } from './grade-availability';
import {
  getAssignmentPointValue,
  isNonPointsScoringType,
  parseGradeNumber,
} from './assignment-score';
import type {
  Assignment,
  CourseGradeAPIResponse,
  CourseGradeDetailResponse,
  Enrollment,
  ExtractedCourse,
  userAccount,
} from './types';

export type GradeReportIssueSeverity = 'error' | 'warning' | 'info';

export type GradeReportIssue = {
  severity: GradeReportIssueSeverity;
  code: string;
  message: string;
  sectionID?: number;
  termID?: number;
};

export type GradeDetailResult = {
  raw?: CourseGradeAPIResponse;
  displayed?: CourseGradeDetailResponse | null;
  error?: string;
};

export type GradeReportSource = {
  responsiveSchedule?: ScheduleAudit;
  sessionRef: string;
  district: string;
  user?: userAccount;
  userError?: string;
  enrollments: Enrollment[];
  assignments?: Assignment[];
  assignmentsError?: string;
  detailsBySection: Map<number, GradeDetailResult>;
};

export type GradeReportOptions = {
  now?: Date;
  preferredTermID?: number;
  preferredTaskID?: number;
  showIdentity?: boolean;
};

export type GradeReport = {
  availability: ReturnType<typeof getGradeAvailability>;
  responsiveSchedule?: ScheduleAudit;
  generatedAt: string;
  asOf: string;
  sessionRef: string;
  district: string;
  user: userAccount | null;
  userError?: string;
  preferredTermID?: number;
  preferredTaskID?: number;
  automaticTermIDs: number[];
  gradingTermIDs: number[];
  terms: ReturnType<typeof getCourseTerms>;
  courses: ExtractedCourse[];
  assignments: Assignment[];
  assignmentsError?: string;
  details: Record<string, GradeDetailResult>;
  issues: GradeReportIssue[];
};

const getDateKey = (date: Date) => date.toISOString().split('T')[0];

const hasDisplayGrade = (
  task: Enrollment['terms'][number]['courses'][number]['gradingTasks'][number]
) =>
  task.progressScore != null ||
  task.progressPercent != null ||
  task.score != null ||
  task.percent != null;

function addIssue(issues: GradeReportIssue[], issue: GradeReportIssue) {
  if (
    issues.some(
      (candidate) =>
        candidate.code === issue.code &&
        candidate.sectionID === issue.sectionID &&
        candidate.termID === issue.termID &&
        candidate.message === issue.message
    )
  ) {
    return;
  }
  issues.push(issue);
}

function auditReport(
  source: GradeReportSource,
  courses: ExtractedCourse[],
  selectedTermIDs: number[],
  gradingTermIDs: number[],
  getSectionGradingTermIDs: (raw: CourseGradeAPIResponse) => number[]
): GradeReportIssue[] {
  const issues: GradeReportIssue[] = [...(source.responsiveSchedule?.issues ?? [])];
  const allTerms = source.enrollments.flatMap((enrollment) => enrollment.terms || []);
  const selectedTerms = allTerms.filter((term) => selectedTermIDs.includes(term.termID));
  const displayedSectionIDs = new Set(courses.map((course) => course.sectionID));

  if (source.userError) {
    addIssue(issues, {
      severity: 'warning',
      code: 'USER_FETCH_FAILED',
      message: source.userError,
    });
  }

  if (source.assignmentsError) {
    addIssue(issues, {
      severity: 'warning',
      code: 'ASSIGNMENTS_FETCH_FAILED',
      message: source.assignmentsError,
    });
  }

  if (source.enrollments.length === 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'NO_ENROLLMENTS',
      message: 'Infinite Campus returned no grade enrollments.',
    });
  } else if (allTerms.length === 0) {
    const disabled = getGradeAvailability(source.enrollments).gradesEnabled === false;
    addIssue(issues, {
      severity: disabled ? 'info' : 'error',
      code: disabled ? 'GRADEBOOK_DISABLED' : 'NO_TERMS',
      message: disabled
        ? 'The school has disabled grade information in Infinite Campus.'
        : 'Infinite Campus returned enrollments but no terms.',
    });
  }

  for (const term of allTerms) {
    if (!term.startDate || !term.endDate || term.startDate > term.endDate) {
      addIssue(issues, {
        severity: 'warning',
        code: 'INVALID_TERM_DATES',
        message: `${term.termName} has unusable dates (${term.startDate || 'missing'} to ${term.endDate || 'missing'}).`,
        termID: term.termID,
      });
    }
  }

  const termSignatures = new Map<number, string>();
  for (const term of allTerms) {
    const signature = `${term.calendarID}|${term.startDate}|${term.endDate}`;
    const previous = termSignatures.get(term.termID);
    if (previous && previous !== signature) {
      addIssue(issues, {
        severity: 'warning',
        code: 'TERM_ID_COLLISION',
        message: `Term ID ${term.termID} is reused with different calendars or dates; ID-only selection may mix school years.`,
        termID: term.termID,
      });
    }
    termSignatures.set(term.termID, signature);
  }

  if (allTerms.length > 0 && selectedTerms.length === 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'SELECTED_TERM_MISSING',
      message: `The selected term IDs (${selectedTermIDs.join(', ') || 'none'}) do not exist in the IC response.`,
    });
  }

  const selectedCourses = selectedTerms.flatMap((term) => term.courses || []);
  const eligibleSelectedCourses = selectedCourses.filter((course) => !course.dropped);

  if (selectedTerms.length > 0 && eligibleSelectedCourses.length === 0) {
    addIssue(issues, {
      severity: 'warning',
      code: 'NO_CURRENT_COURSES',
      message: 'The selected term exists, but IC returned no non-dropped courses for it.',
    });
  }

  for (const course of eligibleSelectedCourses) {
    if ((course.gradingTasks || []).length === 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'COURSE_OMITTED_NO_TASKS',
        message: `${course.courseName} is in the selected term but has no grading tasks, so the app omits it.`,
        sectionID: course.sectionID,
      });
    } else if (!displayedSectionIDs.has(course.sectionID)) {
      addIssue(issues, {
        severity: 'error',
        code: 'COURSE_OMITTED',
        message: `${course.courseName} is in the selected term but is absent from the app course list.`,
        sectionID: course.sectionID,
      });
    }
  }

  if (courses.length === 0 && eligibleSelectedCourses.length > 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'EMPTY_APP_COURSE_LIST',
      message: `IC returned ${eligibleSelectedCourses.length} current course(s), but the app selected none.`,
    });
  }

  for (const course of courses) {
    if (course.percent !== undefined && !Number.isFinite(course.percent)) {
      addIssue(issues, {
        severity: 'warning',
        code: 'INVALID_COURSE_PERCENT',
        message: `${course.courseName} has a non-numeric displayed percent.`,
        sectionID: course.sectionID,
      });
    }

    const rawSelectedCourse = selectedCourses.find(
      (candidate) => candidate.sectionID === course.sectionID
    );
    if (
      course.score == null &&
      course.percent == null &&
      rawSelectedCourse?.gradingTasks.some(hasDisplayGrade)
    ) {
      addIssue(issues, {
        severity: 'error',
        code: 'AVAILABLE_GRADE_NOT_DISPLAYED',
        message: `${course.courseName} has a grade in IC, but the selected task displays no grade.`,
        sectionID: course.sectionID,
      });
    }

    if (!course.hasDetail && !course.hasAssignments) continue;

    const detailResult = source.detailsBySection.get(course.sectionID);
    if (!detailResult) {
      addIssue(issues, {
        severity: 'error',
        code: 'DETAIL_NOT_FETCHED',
        message: `${course.courseName} is tappable in the app, but no detail request was made.`,
        sectionID: course.sectionID,
      });
      continue;
    }

    if (detailResult.error) {
      addIssue(issues, {
        severity: 'error',
        code: 'DETAIL_FETCH_FAILED',
        message: `${course.courseName}: ${detailResult.error}`,
        sectionID: course.sectionID,
      });
      continue;
    }

    if (!detailResult.displayed) {
      addIssue(issues, {
        severity: 'error',
        code: 'NO_DETAIL_SELECTED',
        message: `${course.courseName} returned detail data, but the app could not select a detail task.`,
        sectionID: course.sectionID,
      });
      continue;
    }

    const displayedDetail = detailResult.displayed;
    const sectionGradingTermIDs = detailResult.raw
      ? getSectionGradingTermIDs(detailResult.raw)
      : gradingTermIDs;
    if (
      course.score == null &&
      course.percent == null &&
      (displayedDetail.task.progressScore != null ||
        displayedDetail.task.score != null ||
        displayedDetail.task.progressPercent != null ||
        displayedDetail.task.percent != null)
    ) {
      addIssue(issues, {
        severity: 'error',
        code: 'AVAILABLE_GRADE_NOT_DISPLAYED',
        message: `${course.courseName} has a grade in its detail view, but its course card displays no grade.`,
        sectionID: course.sectionID,
      });
    }
    const relevantAssignmentTermIDs = new Set([
      ...sectionGradingTermIDs,
      displayedDetail.task.termID,
    ]);
    const rawAssignmentIDs = new Set<number>();
    for (const rawDetail of detailResult.raw?.details ?? []) {
      for (const category of rawDetail.categories) {
        for (const assignment of category.assignments || []) {
          if (
            (assignment.termIDs || []).some((termID: number) =>
              relevantAssignmentTermIDs.has(termID)
            )
          ) {
            rawAssignmentIDs.add(assignment.objectSectionID);
          }
        }
      }
    }
    const rawAssignmentCount = rawAssignmentIDs.size;
    const displayedAssignmentCount = displayedDetail.categories.reduce(
      (count, category) => count + category.assignments.length,
      0
    );

    if (
      !sectionGradingTermIDs.includes(displayedDetail.task.termID) &&
      detailResult.raw?.details.some((detail) => sectionGradingTermIDs.includes(detail.task.termID))
    ) {
      addIssue(issues, {
        severity: 'warning',
        code: 'DETAIL_FELL_OUTSIDE_GRADING_PERIOD',
        message: `${course.courseName} displays ${displayedDetail.task.termName}/${displayedDetail.task.taskName}, outside the selected grading period.`,
        sectionID: course.sectionID,
        termID: displayedDetail.task.termID,
      });
    }

    if (rawAssignmentCount > 0 && displayedAssignmentCount === 0) {
      addIssue(issues, {
        severity: 'warning',
        code: 'ASSIGNMENTS_FILTERED_OUT',
        message: `${course.courseName} has ${rawAssignmentCount} raw assignment row(s), but none survive the app term filter.`,
        sectionID: course.sectionID,
      });
    }

    const detailScore = displayedDetail.task.progressScore ?? displayedDetail.task.score ?? null;
    const detailPercent =
      displayedDetail.task.progressPercent ?? displayedDetail.task.percent ?? null;
    if (
      course.taskName !== displayedDetail.task.taskName &&
      (course.score != null || course.percent != null) &&
      (detailScore != null || detailPercent != null) &&
      ((course.score ?? null) !== detailScore || (course.percent ?? null) !== detailPercent)
    ) {
      addIssue(issues, {
        severity: 'warning',
        code: 'CARD_DETAIL_TASK_MISMATCH',
        message: `${course.courseName} shows ${course.taskName} (${course.score ?? '—'}) in the course list but ${displayedDetail.task.taskName} (${detailScore ?? '—'}) in the detail view.`,
        sectionID: course.sectionID,
      });
    }

    if (course.taskName === displayedDetail.task.taskName) {
      if ((course.score ?? null) !== detailScore || (course.percent ?? null) !== detailPercent) {
        addIssue(issues, {
          severity: 'warning',
          code: 'SUMMARY_DETAIL_GRADE_MISMATCH',
          message: `${course.courseName} shows different grade values in the course list and detail view for ${course.taskName}.`,
          sectionID: course.sectionID,
        });
      }
    }

    const objectSectionIDs = new Set<number>();
    for (const category of displayedDetail.categories) {
      for (const assignment of category.assignments) {
        if (objectSectionIDs.has(assignment.objectSectionID)) {
          addIssue(issues, {
            severity: 'warning',
            code: 'DUPLICATE_ASSIGNMENT',
            message: `${course.courseName} repeats assignment ID ${assignment.objectSectionID} across displayed categories.`,
            sectionID: course.sectionID,
          });
        }
        objectSectionIDs.add(assignment.objectSectionID);

        const pointValue = getAssignmentPointValue(assignment);
        const scorePercentage = parseGradeNumber(assignment.scorePercentage);
        const isNonPointsScore = isNonPointsScoringType(assignment.scoringType);
        if (
          isNonPointsScore &&
          assignment.score != null &&
          pointValue === null &&
          !assignment.notGraded
        ) {
          addIssue(issues, {
            severity: 'warning',
            code: 'NON_POINTS_SCORE_WITHOUT_PERCENT',
            message: `${course.courseName}/${assignment.assignmentName} uses IC scoringType ${assignment.scoringType}, but IC supplied no point or percentage value for calculations.`,
            sectionID: course.sectionID,
          });
        }
        if (
          !isNonPointsScore &&
          pointValue !== null &&
          assignment.totalPoints > 0 &&
          scorePercentage !== null &&
          Math.abs((pointValue / assignment.totalPoints) * 100 - scorePercentage) > 0.11
        ) {
          addIssue(issues, {
            severity: 'warning',
            code: 'ASSIGNMENT_PERCENT_MISMATCH',
            message: `${course.courseName}/${assignment.assignmentName} has ${pointValue}/${assignment.totalPoints} points but IC percent ${assignment.scorePercentage}%.`,
            sectionID: course.sectionID,
          });
        }
      }
    }
  }

  if (issues.length === 0) {
    issues.push({
      severity: 'info',
      code: 'NO_ISSUES_FOUND',
      message: 'No structural discrepancies were detected.',
    });
  }

  return issues;
}

export function buildGradeReport(
  source: GradeReportSource,
  options: GradeReportOptions = {}
): GradeReport {
  const now = options.now ?? new Date();
  const allTerms = source.enrollments.flatMap((enrollment) => enrollment.terms || []);
  const automaticTermIDs = getAutomaticTermIDs(allTerms, now);
  const gradingTermIDs = getAutomaticGradingTermIDs(allTerms, now);
  const selectedTermIDs = options.preferredTermID ? [options.preferredTermID] : automaticTermIDs;
  const courses = extractCourseGrades(
    source.enrollments,
    options.preferredTermID,
    options.preferredTaskID,
    now
  );

  const details = Object.fromEntries(
    [...source.detailsBySection.entries()].map(([sectionID, detail]) => [sectionID, detail])
  );

  return {
    generatedAt: new Date().toISOString(),
    availability: getGradeAvailability(source.enrollments),
    responsiveSchedule: source.responsiveSchedule,
    asOf: getDateKey(now),
    sessionRef: source.sessionRef,
    district: source.district,
    user: source.user ?? null,
    userError: source.userError,
    preferredTermID: options.preferredTermID,
    preferredTaskID: options.preferredTaskID,
    automaticTermIDs,
    gradingTermIDs,
    terms: getCourseTerms(source.enrollments),
    courses,
    assignments: source.assignments ?? [],
    assignmentsError: source.assignmentsError,
    details,
    issues: auditReport(source, courses, selectedTermIDs, gradingTermIDs, (raw) =>
      options.preferredTermID ? gradingTermIDs : getDetailGradingTermIDs(raw, now)
    ),
  };
}

function maskValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 2) return '*'.repeat(trimmed.length);
  return `${trimmed[0]}${'*'.repeat(Math.min(trimmed.length - 2, 8))}${trimmed[trimmed.length - 1]}`;
}

function formatUser(user: userAccount | null, showIdentity: boolean) {
  if (!user) return 'Unavailable';
  const firstName = showIdentity ? user.firstName : maskValue(user.firstName || '');
  const lastName = showIdentity ? user.lastName : maskValue(user.lastName || '');
  return `${firstName} ${lastName}`.trim() || 'Unavailable';
}

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatGrade(score: string | null | undefined, percent: number | null | undefined) {
  const scoreLabel = score ?? '—';
  return percent == null ? scoreLabel : `${scoreLabel} (${formatNumber(percent)}%)`;
}

function formatAssignmentFlags(assignment: {
  missing?: boolean | null;
  late?: boolean | null;
  dropped?: boolean | null;
  incomplete?: boolean | null;
  turnedIn?: boolean | null;
  notGraded?: boolean;
}) {
  const flags = [
    assignment.missing ? 'missing' : null,
    assignment.late ? 'late' : null,
    assignment.dropped ? 'dropped' : null,
    assignment.incomplete ? 'incomplete' : null,
    assignment.turnedIn ? 'turned-in' : null,
    assignment.notGraded ? 'not-graded' : null,
  ].filter(Boolean);
  return flags.length > 0 ? ` [${flags.join(', ')}]` : '';
}

function getCategoryPercent(category: CourseGradeDetailResponse['categories'][number]) {
  if (category.progress?.progressPercent != null) {
    return category.progress.progressPercent;
  }
  if (
    category.progress?.progressPointsEarned != null &&
    category.progress.progressTotalPoints != null &&
    category.progress.progressTotalPoints > 0
  ) {
    return (category.progress.progressPointsEarned / category.progress.progressTotalPoints) * 100;
  }

  let earned = 0;
  let possible = 0;
  for (const assignment of category.assignments) {
    if (assignment.dropped || assignment.notGraded || assignment.totalPoints <= 0) continue;
    const score = getAssignmentPointValue(assignment);
    if (score === null && !assignment.missing) continue;
    const multiplier = Number.isFinite(assignment.multiplier) ? assignment.multiplier : 1;
    earned += (score ?? 0) * multiplier;
    possible += assignment.totalPoints * multiplier;
  }
  return possible > 0 ? (earned / possible) * 100 : null;
}

export function formatGradeReport(report: GradeReport, options: GradeReportOptions = {}) {
  const lines: string[] = [];
  const selectedTermIDs = report.preferredTermID
    ? [report.preferredTermID]
    : report.automaticTermIDs;
  const selectedTerms = report.terms.filter((term) => selectedTermIDs.includes(term.termID));

  lines.push('MARKS UI DATA REPORT');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`App date: ${report.asOf}`);
  lines.push(`Session: ${report.sessionRef}`);
  lines.push(`District: ${report.district}`);
  lines.push(`User: ${formatUser(report.user, options.showIdentity ?? false)}`);
  lines.push(
    `Selection: ${report.preferredTermID ? `term ${report.preferredTermID}` : 'Automatic'}${report.preferredTaskID ? `, task ${report.preferredTaskID}` : ''}`
  );
  lines.push(
    `Displayed term(s): ${selectedTerms.map((term) => `${term.termName} [${term.termID}]`).join(', ') || 'none'}`
  );
  lines.push(`Detail grading term IDs: ${report.gradingTermIDs.join(', ') || 'none'}`);
  lines.push(
    `Availability: grades=${report.availability.gradesEnabled ?? 'unknown'} assignments=${report.availability.assignmentsEnabled ?? 'unknown'}`
  );

  lines.push('');
  lines.push(`COURSES (${report.courses.length})`);
  if (report.courses.length === 0) lines.push('  No courses found');

  report.courses.forEach((course, index) => {
    const detail = report.details[course.sectionID]?.displayed;
    lines.push('');
    lines.push(`${index + 1}. ${course.courseName} — ${formatGrade(course.score, course.percent)}`);
    lines.push(`   Teacher: ${course.teacher || '—'}`);
    lines.push(
      `   ${course.termName} · ${course.taskName} · section ${course.sectionID}${course.hasDetail || course.hasAssignments ? '' : ' · no assignments'}`
    );

    const detailResult = report.details[course.sectionID];
    if (detailResult?.error) {
      lines.push(`   Detail error: ${detailResult.error}`);
      return;
    }
    if (!detail) return;

    const detailScore = detail.task.progressScore ?? detail.task.score;
    const detailPercent = detail.task.progressPercent ?? detail.task.percent;
    lines.push(
      `   Detail: ${detail.task.termName} · ${detail.task.taskName} · ${formatGrade(detailScore, detailPercent)} · ${detail.task.groupWeighted ? 'weighted' : 'points'}`
    );

    if (detail.categories.length === 0) {
      lines.push('   No categories found');
      return;
    }

    for (const category of detail.categories) {
      const categoryPercent = getCategoryPercent(category);
      const progress = categoryPercent == null ? null : `${formatNumber(categoryPercent)}%`;
      const weight = category.weight > 0 ? ` · weight ${formatNumber(category.weight)}%` : '';
      lines.push(
        `   Category: ${category.name}${progress ? ` — ${progress}` : ''}${weight} · ${category.assignments.length} assignment(s)`
      );

      const sortedCategoryAssignments = [...category.assignments].sort((left, right) => {
        const leftDate = left.scoreModifiedDate || left.dueDate;
        const rightDate = right.scoreModifiedDate || right.dueDate;
        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      });
      for (const assignment of sortedCategoryAssignments) {
        const percentage = assignment.scorePercentage
          ? ` (${formatNumber(assignment.scorePercentage)}%)`
          : '';
        const multiplier = assignment.multiplier !== 1 ? ` · ${assignment.multiplier}x` : '';
        const score = isNonPointsScoringType(assignment.scoringType)
          ? `mark ${formatNumber(assignment.score)}`
          : `${formatNumber(assignment.scorePoints ?? assignment.score)}/${formatNumber(assignment.totalPoints)}`;
        lines.push(
          `     ${assignment.dueDate || 'no due date'} | ${assignment.assignmentName} | ${score}${percentage}${multiplier}${formatAssignmentFlags(assignment)}`
        );
      }
    }
  });

  const sortedAssignments = report.assignments
    .filter((assignment) => {
      const dueDate = assignment.dueDate?.slice(0, 10);
      return dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate >= report.asOf;
    })
    .sort((left, right) => (left.dueDate || '').localeCompare(right.dueDate || ''));
  lines.push('');
  lines.push(
    `UPCOMING ASSIGNMENTS (${sortedAssignments.length} visible, ${report.assignments.length} returned)`
  );
  if (report.assignmentsError) lines.push(`  Error: ${report.assignmentsError}`);
  if (!report.assignmentsError && sortedAssignments.length === 0) {
    lines.push('  No assignments found');
  }
  for (const assignment of sortedAssignments) {
    const score = assignment.notGraded
      ? 'not graded'
      : `${isNonPointsScoringType(assignment.scoringType) ? `mark ${formatNumber(assignment.score)}` : `${formatNumber(assignment.scorePoints ?? assignment.score)}/${formatNumber(assignment.totalPoints)}`}${assignment.scorePercentage ? ` (${formatNumber(assignment.scorePercentage)}%)` : ''}`;
    lines.push(
      `  ${assignment.dueDate || 'no due date'} | ${assignment.courseName || `section ${assignment.sectionID}`} | ${assignment.assignmentName} | ${score}${formatAssignmentFlags(assignment)}`
    );
  }

  lines.push('');
  lines.push(`TERM INVENTORY (${report.terms.length})`);
  for (const term of report.terms) {
    const selected = selectedTermIDs.includes(term.termID) ? ' [DISPLAYED]' : '';
    lines.push(
      `  ${term.academicYear ? `${term.academicYear} · ` : ''}${term.termName} [${term.termID}] · ${term.startDate} to ${term.endDate} · calendar ${term.calendarID}${selected}`
    );
    for (const task of term.tasks) {
      lines.push(
        `    ${task.taskName} [${task.taskID}] · ${formatGrade(task.score, task.percent)} · grades=${task.hasGrades} assignments=${task.hasAssignments} detail=${task.hasDetail}`
      );
    }
  }

  lines.push('');
  if (report.responsiveSchedule) lines.push(formatSchedule(report.responsiveSchedule), '');
  lines.push(`DIAGNOSTICS (${report.issues.length})`);
  for (const issue of report.issues) {
    const context = [
      issue.sectionID ? `section ${issue.sectionID}` : null,
      issue.termID ? `term ${issue.termID}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(
      `  ${issue.severity.toUpperCase()} ${issue.code}${context ? ` (${context})` : ''}: ${issue.message}`
    );
  }

  return lines.join('\n');
}

export function formatGradeReportSummary(report: GradeReport) {
  const errors = report.issues.filter((issue) => issue.severity === 'error');
  const warnings = report.issues.filter((issue) => issue.severity === 'warning');
  const issueCodes = [...new Set([...errors, ...warnings].map((issue) => issue.code))];
  return `${report.sessionRef} | courses=${report.courses.length} assignments=${report.assignments.length} errors=${errors.length} warnings=${warnings.length}${report.availability.gradesEnabled === false ? ' gradebook=disabled' : ''}${report.responsiveSchedule ? ` ${scheduleSummary(report.responsiveSchedule)}` : ''}${issueCodes.length > 0 ? ` | ${issueCodes.join(',')}` : ''}`;
}
