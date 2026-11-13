import type {
  Course,
  CourseGradeAPIResponse,
  CourseGradeAssignment,
  CourseGradeCategory,
  CourseGradeDetailResponse,
  CourseGradeTask,
  CourseGradeTerm,
  CourseTermOption,
  Enrollment,
  ExtractedCourse,
} from './types';

type DatedTerm = Pick<
  CourseGradeTerm,
  'calendarID' | 'termID' | 'termSeq' | 'startDate' | 'endDate'
> & { courses?: Course[] };

const getDateKey = (date: Date) => date.toISOString().split('T')[0];

/**
 * Select the term(s) that Automatic mode should display across all enrollments.
 *
 * Infinite Campus can return multiple school years at once, with termSeq restarting
 * at 1 each year. Dates, rather than sequence numbers or grade activity, are the
 * reliable way to distinguish the active school year. During a term gap or summer,
 * prefer the next published term so newly-created courses appear before grades do.
 */
export const getAutomaticTermIDs = (terms: DatedTerm[], now: Date = new Date()): number[] => {
  const today = getDateKey(now);
  const datedTerms = terms.filter(
    (term) => term.startDate && term.endDate && term.startDate <= term.endDate
  );

  const activeTerms = datedTerms.filter((term) => term.startDate <= today && today <= term.endDate);
  if (activeTerms.length > 0) {
    return [...new Set(activeTerms.map((term) => term.termID))];
  }

  const nextStartDate = datedTerms
    .filter((term) => term.startDate > today)
    .reduce<
      string | null
    >((closest, term) => (!closest || term.startDate < closest ? term.startDate : closest), null);
  if (nextStartDate) {
    return [
      ...new Set(
        datedTerms.filter((term) => term.startDate === nextStartDate).map((term) => term.termID)
      ),
    ];
  }

  const latestEndDate = datedTerms.reduce<string | null>(
    (latest, term) => (!latest || term.endDate > latest ? term.endDate : latest),
    null
  );
  if (latestEndDate) {
    return [
      ...new Set(
        datedTerms.filter((term) => term.endDate === latestEndDate).map((term) => term.termID)
      ),
    ];
  }

  return [...new Set(terms.map((term) => term.termID))];
};

/**
 * Whether a term the student pinned has been replaced by a newer one: it has ended
 * (or is no longer published) while a different term is in session. A pin like that
 * keeps showing the old term's final state, which reads as grades that stopped
 * updating. During a break with no term in session the pin is left alone.
 */
export const isPinnedTermSuperseded = (
  terms: Pick<CourseGradeTerm, 'termID' | 'startDate' | 'endDate'>[],
  pinnedTermID: number,
  now: Date = new Date()
): boolean => {
  if (terms.length === 0) return false;
  const today = getDateKey(now);
  const pinned = terms.filter((term) => term.termID === pinnedTermID);
  if (pinned.some((term) => !term.endDate || term.endDate >= today)) return false;
  return terms.some(
    (term) =>
      term.termID !== pinnedTermID &&
      term.startDate &&
      term.endDate &&
      term.startDate <= today &&
      today <= term.endDate
  );
};

type HoldsAssignments = (termID: number) => boolean;

const termHoldsAssignments = (terms: DatedTerm[], sectionID?: number): HoldsAssignments => {
  const termIDs = new Set(
    terms
      .filter((term) =>
        (term.courses || []).some(
          (course) =>
            (sectionID === undefined || course.sectionID === sectionID) &&
            (course.gradingTasks || []).some((task) => task.hasAssignments)
        )
      )
      .map((term) => term.termID)
  );
  return (termID) => termIDs.has(termID);
};

const getAdjacentTermIDs = (terms: DatedTerm[], activeTerm: DatedTerm) => {
  const calendarTerms = terms.filter(
    (term) => term.calendarID === activeTerm.calendarID && term.startDate
  );
  const previousStart = calendarTerms
    .filter((term) => term.startDate < activeTerm.startDate)
    .reduce<
      string | null
    >((latest, term) => (!latest || term.startDate > latest ? term.startDate : latest), null);
  const nextStart = calendarTerms
    .filter((term) => term.startDate > activeTerm.startDate)
    .reduce<
      string | null
    >((earliest, term) => (!earliest || term.startDate < earliest ? term.startDate : earliest), null);
  const idsStartingOn = (startDate: string | null) =>
    new Set(
      calendarTerms.filter((term) => term.startDate === startDate).map((term) => term.termID)
    );
  return { previous: idsStartingOn(previousStart), next: idsStartingOn(nextStart) };
};

/**
 * Resolve the terms whose grading tasks belong to the active terms' grading period.
 *
 * Districts differ in where a term's grades live. Many grade each term on its own
 * task. Others keep the running grade and assignments on a semester task attached
 * to the following term, and post only a progress grade on the earlier term
 * (SRVUSD's quarter/semester layout). IC exposes this through hasAssignments:
 * include the next term when its tasks already collect assignments. Keep the
 * previous term unless it and the active term each keep their own assignments
 * and nothing in the active term spans it, so districts that grade each term
 * separately do not carry last term's grade forward. Terms that IC says hold the
 * active term's assignments are always included.
 */
const resolveGradingTermIDs = (
  terms: DatedTerm[],
  activeTermIDs: Iterable<number>,
  holdsAssignments: HoldsAssignments,
  assignmentHolderTermIDs: Iterable<number> = [],
  spannedTermIDs: ReadonlySet<number> = new Set()
) => {
  const gradingTermIDs = new Set([...activeTermIDs, ...assignmentHolderTermIDs]);

  for (const activeTermID of activeTermIDs) {
    const activeTerm = terms.find((term) => term.termID === activeTermID && term.startDate);
    if (!activeTerm) continue;

    const { previous, next } = getAdjacentTermIDs(terms, activeTerm);
    for (const termID of next) if (holdsAssignments(termID)) gradingTermIDs.add(termID);
    for (const termID of previous) {
      if (
        !holdsAssignments(termID) ||
        !holdsAssignments(activeTermID) ||
        spannedTermIDs.has(termID)
      ) {
        gradingTermIDs.add(termID);
      }
    }
  }

  return [...gradingTermIDs];
};

/**
 * Grading period terms for Automatic mode across every section in the response.
 * Course and detail selection resolve this per section; this whole-response view
 * is used for diagnostics.
 */
export const getAutomaticGradingTermIDs = (terms: DatedTerm[], now: Date = new Date()): number[] =>
  resolveGradingTermIDs(terms, getAutomaticTermIDs(terms, now), termHoldsAssignments(terms));

/**
 * Grading period terms for one section's grade-detail response. Assignment rows
 * carry the schedule terms they belong to, which identifies the task holding the
 * active term's work even when it sits on a different term.
 */
export const getDetailGradingTermIDs = (
  data: CourseGradeAPIResponse,
  now: Date = new Date()
): number[] => {
  const activeTermIDs = getAutomaticTermIDs(data.terms, now);
  const activeTermIDSet = new Set(activeTermIDs);
  const taskTermIDs = new Set(
    data.details.filter((detail) => detail.task.hasAssignments).map((detail) => detail.task.termID)
  );
  const assignmentTermIDs = (detail: CourseGradeAPIResponse['details'][number]) =>
    (detail.categories || []).flatMap((category) =>
      (category.assignments || []).flatMap(
        (assignment: { termIDs?: number[] }) => assignment.termIDs || []
      )
    );
  const holderTermIDs = data.details
    .filter((detail) => assignmentTermIDs(detail).some((termID) => activeTermIDSet.has(termID)))
    .map((detail) => detail.task.termID);
  const holderTermIDSet = new Set([...activeTermIDs, ...holderTermIDs]);
  // Terms whose assignments sit on an active-period task, e.g. quarter one's work
  // on a semester task attached to quarter two.
  const spannedTermIDs = new Set(
    data.details
      .filter((detail) => holderTermIDSet.has(detail.task.termID))
      .flatMap(assignmentTermIDs)
  );

  return resolveGradingTermIDs(
    data.terms,
    activeTermIDs,
    (termID) => taskTermIDs.has(termID),
    holderTermIDs,
    spannedTermIDs
  );
};

export const compareModifiedDate = (a?: string | null, b?: string | null) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
};

const hasDisplayGrade = (task: Course['gradingTasks'][number] | undefined) =>
  !!task &&
  (task.progressScore != null ||
    task.progressPercent != null ||
    task.score != null ||
    task.percent != null);

// IC reports a live calculation in progressScore/progressPercent; score/percent
// are grades a teacher posted at a point in time.
const isRunningGradeTask = (
  task: Pick<Course['gradingTasks'][number], 'hasDetail' | 'progressScore' | 'progressPercent'>
) => task.hasDetail && (task.progressScore != null || task.progressPercent != null);

const isStandardTask = (task: { standardID?: number | null } | undefined) =>
  task?.standardID != null;

/**
 * Standards-based (rubric) courses grade each learning standard as its own task
 * and roll them into an overall task (e.g. "Course Final"). Prefer that overall
 * task so one standard's mark is never presented as the course grade.
 */
const selectOverallTask = (tasks: Course['gradingTasks']) => {
  const candidates = [...tasks]
    .filter((task) => !isStandardTask(task) && task.hasDetail)
    .sort((a, b) => compareModifiedDate(a.modifiedDate, b.modifiedDate));
  return candidates.find(hasDisplayGrade) || candidates[0];
};

const selectCourseTask = (tasks: Course['gradingTasks'] = [], preferredTaskID?: number) => {
  const sorted = [...tasks].sort((a, b) => compareModifiedDate(a.modifiedDate, b.modifiedDate));
  const preferredTask = preferredTaskID
    ? sorted.find((task) => task.taskID === preferredTaskID && hasDisplayGrade(task))
    : undefined;

  return (
    preferredTask ||
    sorted.find((task) => task.hasAssignments && task.hasDetail && hasDisplayGrade(task)) ||
    // Standards (rubric) tasks carry a standardID; prefer an overall course grade.
    sorted.find((task) => task.standardID == null && hasDisplayGrade(task)) ||
    sorted.find(hasDisplayGrade) ||
    sorted.find((task) => task.hasAssignments && task.hasDetail) ||
    sorted[0]
  );
};

export const getCourseTerms = (enrollments: Enrollment[]): CourseTermOption[] => {
  const uniqueTerms = new Map<number, CourseTermOption>();

  for (const enrollment of enrollments) {
    for (const term of enrollment.terms || []) {
      const existingTerm = uniqueTerms.get(term.termID);

      if (!existingTerm) {
        const courseEndYear = term.courses?.find((course) => course.endYear)?.endYear;
        const yearMatch = enrollment.displayName?.match(/\b(\d{2,4}\s*[-–]\s*\d{2,4})\b/);
        const academicYear =
          yearMatch?.[1]?.replace(/\s/g, '') ??
          (courseEndYear ? `${courseEndYear - 1}-${courseEndYear}` : null);

        uniqueTerms.set(term.termID, {
          termID: term.termID,
          termName: term.termName,
          termSeq: term.termSeq,
          calendarID: term.calendarID,
          academicYear,
          startDate: term.startDate,
          endDate: term.endDate,
          tasks: [],
        });
      }

      const option = uniqueTerms.get(term.termID)!;
      for (const task of (term.courses || []).flatMap((course) => course.gradingTasks || [])) {
        const existingTask = option.tasks.find((candidate) => candidate.taskID === task.taskID);
        const score = task.progressScore ?? task.score ?? null;
        const percent = task.progressPercent ?? task.percent ?? null;

        if (!existingTask) {
          option.tasks.push({
            taskID: task.taskID,
            taskName: task.taskName,
            modifiedDate: task.modifiedDate ?? null,
            score,
            percent,
            hasGrades: hasDisplayGrade(task),
            hasAssignments: task.hasAssignments,
            hasDetail: task.hasDetail,
          });
          continue;
        }

        existingTask.hasGrades ||= hasDisplayGrade(task);
        existingTask.hasAssignments ||= task.hasAssignments;
        existingTask.hasDetail ||= task.hasDetail;
        if (compareModifiedDate(existingTask.modifiedDate, task.modifiedDate) > 0) {
          existingTask.modifiedDate = task.modifiedDate ?? null;
        }
        if (existingTask.score !== score || existingTask.percent !== percent) {
          existingTask.score = null;
          existingTask.percent = null;
        }
      }
    }
  }

  return [...uniqueTerms.values()]
    .map((term) => ({
      ...term,
      tasks: term.tasks.sort((a, b) => {
        const assignmentsA = a.hasAssignments && a.hasDetail ? 1 : 0;
        const assignmentsB = b.hasAssignments && b.hasDetail ? 1 : 0;
        return assignmentsB - assignmentsA || compareModifiedDate(a.modifiedDate, b.modifiedDate);
      }),
    }))
    .sort(
      (a, b) =>
        b.startDate.localeCompare(a.startDate) ||
        b.endDate.localeCompare(a.endDate) ||
        b.termSeq - a.termSeq
    );
};

export const extractCourseGrades = (
  enrollments: Enrollment[],
  preferredTermID?: number,
  preferredTaskID?: number,
  now: Date = new Date()
): ExtractedCourse[] => {
  const allTerms = enrollments.flatMap((enrollment) => enrollment.terms || []);
  const selectedTermIDs = preferredTermID ? [preferredTermID] : getAutomaticTermIDs(allTerms, now);

  return enrollments.flatMap((enrollment) => {
    const sortedTerms = [...(enrollment.terms || [])]
      .filter((term) => selectedTermIDs.includes(term.termID))
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.termSeq - a.termSeq);
    const processedCourses = new Set<number>();
    const results: ExtractedCourse[] = [];

    for (const term of sortedTerms) {
      for (const course of term.courses || []) {
        if (processedCourses.has(course.sectionID) || course.dropped) continue;

        let task = selectCourseTask(course.gradingTasks, preferredTaskID);
        if (!task) continue;

        const gradingTermIDs = preferredTermID
          ? [preferredTermID]
          : resolveGradingTermIDs(
              enrollment.terms || [],
              [term.termID],
              termHoldsAssignments(enrollment.terms || [], course.sectionID)
            );
        const gradingPeriodTasks = (enrollment.terms || [])
          .filter((candidateTerm) => gradingTermIDs.includes(candidateTerm.termID))
          .flatMap((candidateTerm) => candidateTerm.courses || [])
          .filter((candidateCourse) => candidateCourse.sectionID === course.sectionID)
          .flatMap((candidateCourse) => candidateCourse.gradingTasks || []);

        // The current schedule term can contain only empty progress tasks while
        // IC publishes its running grade on the semester task in the paired term.
        if (!preferredTermID && !hasDisplayGrade(task)) {
          task = selectCourseTask(gradingPeriodTasks, preferredTaskID) ?? task;
        }

        // A posted progress grade is a snapshot; IC headlines the running grade on
        // the task that collects assignments, which may sit on the paired term.
        if (!preferredTermID && task.taskID !== preferredTaskID && !isRunningGradeTask(task)) {
          task =
            [...gradingPeriodTasks]
              .sort((a, b) => compareModifiedDate(a.modifiedDate, b.modifiedDate))
              .find(isRunningGradeTask) ?? task;
        }

        const overallTask =
          isStandardTask(task) && task.taskID !== preferredTaskID
            ? selectOverallTask([...course.gradingTasks, ...gradingPeriodTasks])
            : undefined;
        if (overallTask) task = overallTask;

        results.push({
          courseName: course.courseName,
          teacher: course.teacherDisplay,
          sectionID: course.sectionID,
          calendarID: term.calendarID,
          structureID: course.structureID,
          enrollmentID: enrollment.enrollmentID,
          score: task.progressScore ?? task.score ?? undefined,
          percent: task.progressPercent ?? task.percent ?? undefined,
          termName: term.termName,
          taskName: (overallTask ? task.taskName.trim() : task.taskName) || 'Unknown',
          hasAssignments:
            task.hasAssignments || gradingPeriodTasks.some((candidate) => candidate.hasAssignments),
          hasDetail: task.hasDetail || gradingPeriodTasks.some((candidate) => candidate.hasDetail),
          ...(overallTask ? { standardsBased: true } : {}),
        });

        processedCourses.add(course.sectionID);
      }
    }

    return results;
  });
};

/**
 * Apply the same detail/task selection used by the course screen to a raw
 * Infinite Campus grade-detail response.
 *
 * Keeping this transformation outside the HTTP route lets diagnostics and
 * fixture tests exercise the exact behavior the app uses in production.
 */
export const extractCourseGradeDetail = (
  data: CourseGradeAPIResponse,
  preferredTermID?: number,
  preferredTaskID?: number,
  now: Date = new Date()
): CourseGradeDetailResponse | null => {
  // Some districts return [] when grade information is disabled.
  if (!Array.isArray(data?.terms) || !Array.isArray(data?.details)) return null;
  const automaticTermIDs = getDetailGradingTermIDs(data, now);
  const detailsByRecentUpdate = [...data.details].sort((a, b) =>
    compareModifiedDate(a.task.modifiedDate, b.task.modifiedDate)
  );
  const preferredTermIDs = preferredTermID ? [preferredTermID] : automaticTermIDs;
  const hasAssignmentDetail = (detail: CourseGradeAPIResponse['details'][number]) =>
    detail.task.hasAssignments &&
    detail.task.hasDetail &&
    detail.categories.some((category) => (category.assignments || []).length > 0);
  const inPreferredTerm = (detail: CourseGradeAPIResponse['details'][number]) =>
    preferredTermIDs.includes(detail.task.termID);
  const isPreferredTask = (detail: CourseGradeAPIResponse['details'][number]) =>
    preferredTaskID !== undefined && detail.task.taskID === preferredTaskID;
  const detail =
    detailsByRecentUpdate.find(
      (candidate) => inPreferredTerm(candidate) && isPreferredTask(candidate)
    ) ||
    detailsByRecentUpdate.find(
      (candidate) =>
        inPreferredTerm(candidate) &&
        hasAssignmentDetail(candidate) &&
        (preferredTermID !== undefined || isRunningGradeTask(candidate.task))
    ) ||
    detailsByRecentUpdate.find(
      (candidate) => inPreferredTerm(candidate) && hasAssignmentDetail(candidate)
    ) ||
    detailsByRecentUpdate.find(hasAssignmentDetail) ||
    detailsByRecentUpdate.find(
      (candidate) => inPreferredTerm(candidate) && candidate.task.hasDetail
    ) ||
    detailsByRecentUpdate.find(inPreferredTerm) ||
    detailsByRecentUpdate.find((candidate) => candidate.task.hasAssignments) ||
    detailsByRecentUpdate[0];

  if (!detail) return null;

  type RawDetail = CourseGradeAPIResponse['details'][number];
  // Rubric courses: show the overall task with every standard's assignments
  // rather than the one standard that happened to be selected.
  const overallCandidates =
    isStandardTask(detail.task) && !isPreferredTask(detail)
      ? detailsByRecentUpdate.filter(
          (candidate) =>
            !isStandardTask(candidate.task) &&
            candidate.task.hasDetail &&
            inPreferredTerm(candidate)
        )
      : [];
  const overallDetail =
    overallCandidates.find((candidate) => hasDisplayGrade(candidate.task)) || overallCandidates[0];
  const standardsDetails = overallDetail
    ? detailsByRecentUpdate.filter(
        (candidate) =>
          isStandardTask(candidate.task) && (inPreferredTerm(candidate) || candidate === detail)
      )
    : [];
  const displayedTask: RawDetail['task'] = overallDetail?.task ?? detail.task;

  const task: CourseGradeTask = {
    taskID: displayedTask.taskID,
    taskName: overallDetail ? displayedTask.taskName.trim() : displayedTask.taskName,
    termID: displayedTask.termID,
    termName: displayedTask.termName,
    termSeq: displayedTask.termSeq,
    courseName: displayedTask.courseName,
    sectionID: displayedTask.sectionID,
    score: displayedTask.score ?? null,
    percent: displayedTask.percent ?? null,
    progressScore: displayedTask.progressScore ?? null,
    progressPercent: displayedTask.progressPercent ?? null,
    progressPointsEarned: displayedTask.progressPointsEarned ?? null,
    progressTotalPoints: displayedTask.progressTotalPoints ?? null,
    comments: displayedTask.comments ?? null,
    hasAssignments: displayedTask.hasAssignments,
    hasDetail: displayedTask.hasDetail,
    groupWeighted: displayedTask.groupWeighted,
  };

  const toAssignment = (assignment: any): CourseGradeAssignment => ({
    objectSectionID: assignment.objectSectionID,
    assignmentName: assignment.assignmentName,
    sectionID: assignment.sectionID,
    dueDate: assignment.dueDate,
    assignedDate: assignment.assignedDate,
    scoreModifiedDate: assignment.scoreModifiedDate,
    termIDs: assignment.termIDs || [],
    score: assignment.score,
    scorePoints: assignment.scorePoints,
    scorePercentage: assignment.scorePercentage,
    scoringType: assignment.scoringType ?? null,
    // Rubric-scored assignments can omit points entirely.
    totalPoints: assignment.totalPoints ?? 0,
    comments: assignment.comments,
    feedback: assignment.feedback,
    late: assignment.late,
    missing: assignment.missing,
    dropped: assignment.dropped,
    incomplete: assignment.incomplete,
    turnedIn: assignment.turnedIn,
    notGraded: assignment.notGraded ?? false,
    multiplier: assignment.multiplier ?? 1,
  });

  if (overallDetail) {
    // Merge each standard's categories by name; one assignment can be aligned to
    // several standards, so keep it once.
    const merged = new Map<string, CourseGradeCategory>();
    const seenAssignments = new Set<number>();
    for (const standard of standardsDetails) {
      for (const category of standard.categories || []) {
        const target: CourseGradeCategory = merged.get(category.name) ?? {
          groupID: category.groupID,
          name: category.name,
          weight: 0,
          assignments: [],
          progress: null,
        };
        for (const assignment of category.assignments || []) {
          if (seenAssignments.has(assignment.objectSectionID)) continue;
          seenAssignments.add(assignment.objectSectionID);
          target.assignments.push(toAssignment(assignment));
        }
        merged.set(category.name, target);
      }
    }

    return {
      task,
      categories: [...merged.values()].filter((category) => category.assignments.length > 0),
      standards: standardsDetails
        .filter((standard) => standard.task.hasDetail || standard.task.hasAssignments)
        .sort((a, b) => (a.task.treeTraversalSeq ?? 0) - (b.task.treeTraversalSeq ?? 0))
        .map((standard) => ({
          taskID: standard.task.taskID,
          taskName: standard.task.taskName.trim(),
          score: standard.task.progressScore ?? standard.task.score ?? null,
          percent: standard.task.progressPercent ?? standard.task.percent ?? null,
        })),
    };
  }

  const categories: CourseGradeCategory[] = detail.categories.map((category) => {
    // IC already associates these assignments with the selected grading task.
    // Their schedule term IDs need not match the term holding a semester grade.
    const assignments: CourseGradeAssignment[] = (category.assignments || []).map(toAssignment);

    return {
      groupID: category.groupID,
      name: category.name,
      weight: category.weight,
      assignments,
      progress: category.progress
        ? {
            progressScore: category.progress.progressScore,
            progressPercent: category.progress.progressPercent,
            progressPointsEarned: category.progress.progressPointsEarned,
            progressTotalPoints: category.progress.progressTotalPoints,
          }
        : null,
    };
  });

  return { task, categories };
};
