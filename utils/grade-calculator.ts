import type { CourseGradeCategory, CourseGradeAssignment, CourseGradeTask } from '@/api/src/types';
import {
  formatGradeNumber,
  getAssignmentPointValue,
  parseGradeNumber,
} from '@/api/src/assignment-score';
import type { VirtualAssignment, VirtualCategory } from '@/app/(protected)/(course)/_context';

export function percentToLetterGrade(percent: number): string {
  if (percent >= 97) return 'A+';
  if (percent >= 93) return 'A';
  if (percent >= 90) return 'A-';
  if (percent >= 87) return 'B+';
  if (percent >= 83) return 'B';
  if (percent >= 80) return 'B-';
  if (percent >= 77) return 'C+';
  if (percent >= 73) return 'C';
  if (percent >= 70) return 'C-';
  if (percent >= 67) return 'D+';
  if (percent >= 63) return 'D';
  if (percent >= 60) return 'D-';
  return 'F';
}

type WhatIfModification = {
  score?: string | null;
  totalPoints?: number | null;
  dropped?: boolean;
};

type GradeTotals = {
  pointsEarned: number;
  totalPoints: number;
};

export type RecalculateGradeOptions = {
  baselinePercent?: number | null;
  baselinePointsEarned?: number | null;
  baselineTotalPoints?: number | null;
};

export type ModifiedAssignment = CourseGradeAssignment & {
  isModified: boolean;
  originalScore: string | null;
  originalScorePoints: string | null;
  originalScorePercentage: string | null;
  originalScoringType: string | null;
  originalTotalPoints: number | null;
  originalDropped: boolean | null;
};

export type ModifiedCategory = Omit<CourseGradeCategory, 'assignments'> & {
  assignments: ModifiedAssignment[];
  isVirtual?: boolean;
};

function calculateAssignmentPercentage(score: string | null, totalPoints: number): string | null {
  const scoreNum = parseGradeNumber(score);
  if (scoreNum === null || totalPoints <= 0) return null;

  return ((scoreNum / totalPoints) * 100).toFixed(2);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasCountedScoreOrMissing(
  assignment: Pick<
    CourseGradeAssignment,
    'score' | 'scorePoints' | 'scorePercentage' | 'scoringType' | 'missing' | 'totalPoints'
  >
) {
  return (
    getAssignmentPointValue(assignment) !== null ||
    (!!assignment.missing && assignment.totalPoints > 0)
  );
}

export function isCountedGradeAssignment(
  assignment: Pick<
    CourseGradeAssignment,
    | 'score'
    | 'scorePoints'
    | 'scorePercentage'
    | 'scoringType'
    | 'missing'
    | 'totalPoints'
    | 'dropped'
    | 'notGraded'
  >
) {
  return hasCountedScoreOrMissing(assignment) && !assignment.dropped && !assignment.notGraded;
}

function isOriginallyCountedAssignment(assignment: ModifiedAssignment) {
  return (
    (getOriginalAssignmentPointValue(assignment) !== null ||
      (!!assignment.missing &&
        !!assignment.originalTotalPoints &&
        assignment.originalTotalPoints > 0)) &&
    !assignment.originalDropped &&
    !assignment.notGraded
  );
}

function getAssignmentEarnedPoints(assignment: ModifiedAssignment) {
  return (getAssignmentPointValue(assignment) ?? 0) * assignment.multiplier;
}

function getAssignmentDenominatorPoints(
  assignment: Pick<ModifiedAssignment, 'totalPoints' | 'multiplier'>
) {
  return assignment.totalPoints > 0 ? assignment.totalPoints * assignment.multiplier : 0;
}

function getOriginalAssignmentPointValue(assignment: ModifiedAssignment) {
  return getAssignmentPointValue({
    score: assignment.originalScore,
    scorePoints: assignment.originalScorePoints,
    scorePercentage: assignment.originalScorePercentage,
    scoringType: assignment.originalScoringType,
    totalPoints: assignment.originalTotalPoints ?? 0,
  });
}

function getOriginalAssignmentEarnedPoints(assignment: ModifiedAssignment) {
  return (getOriginalAssignmentPointValue(assignment) ?? 0) * assignment.multiplier;
}

function getOriginalAssignmentDenominatorPoints(
  assignment: Pick<ModifiedAssignment, 'originalTotalPoints' | 'multiplier'>
) {
  return assignment.originalTotalPoints && assignment.originalTotalPoints > 0
    ? assignment.originalTotalPoints * assignment.multiplier
    : 0;
}

export function getHiddenAssignmentMaxPoints(category: ModifiedCategory): number | null {
  const progress = category.progress;
  if (
    !isFiniteNumber(progress?.progressPointsEarned) ||
    !isFiniteNumber(progress?.progressTotalPoints)
  ) {
    return null;
  }

  let shownEarned = 0;
  let shownTotal = 0;
  for (const assignment of category.assignments) {
    if (!isOriginallyCountedAssignment(assignment)) continue;
    shownEarned += getOriginalAssignmentEarnedPoints(assignment);
    shownTotal += getOriginalAssignmentDenominatorPoints(assignment);
  }

  const missingEarned = progress.progressPointsEarned - shownEarned;
  const missingTotal = progress.progressTotalPoints - shownTotal;
  return missingEarned >= -0.01 && missingTotal >= 0.01 ? missingTotal : null;
}

function getCategoryProgressTotals(category: ModifiedCategory): GradeTotals {
  if (
    category.progress?.progressPointsEarned !== null &&
    category.progress?.progressPointsEarned !== undefined &&
    category.progress?.progressTotalPoints !== null &&
    category.progress?.progressTotalPoints !== undefined
  ) {
    return {
      pointsEarned: category.progress.progressPointsEarned,
      totalPoints: category.progress.progressTotalPoints,
    };
  }

  let pointsEarned = 0;
  let totalPoints = 0;

  for (const assignment of category.assignments) {
    if (isOriginallyCountedAssignment(assignment)) {
      pointsEarned += getOriginalAssignmentEarnedPoints(assignment);
      totalPoints += getOriginalAssignmentDenominatorPoints(assignment);
    }
  }

  return { pointsEarned, totalPoints };
}

function getCategoryDeltaTotals(category: ModifiedCategory): GradeTotals {
  let deltaEarned = 0;
  let deltaTotal = 0;

  for (const assignment of category.assignments) {
    const modifiedEarned = isCountedGradeAssignment(assignment)
      ? getAssignmentEarnedPoints(assignment)
      : 0;
    const modifiedTotal = isCountedGradeAssignment(assignment)
      ? getAssignmentDenominatorPoints(assignment)
      : 0;
    const originalEarned = isOriginallyCountedAssignment(assignment)
      ? getOriginalAssignmentEarnedPoints(assignment)
      : 0;
    const originalTotal = isOriginallyCountedAssignment(assignment)
      ? getOriginalAssignmentDenominatorPoints(assignment)
      : 0;

    deltaEarned += modifiedEarned - originalEarned;
    deltaTotal += modifiedTotal - originalTotal;
  }

  return {
    pointsEarned: deltaEarned,
    totalPoints: deltaTotal,
  };
}

function addTotals(left: GradeTotals, right: GradeTotals): GradeTotals {
  return {
    pointsEarned: left.pointsEarned + right.pointsEarned,
    totalPoints: left.totalPoints + right.totalPoints,
  };
}

function getCategoryAdjustedProgressTotals(category: ModifiedCategory) {
  return addTotals(getCategoryProgressTotals(category), getCategoryDeltaTotals(category));
}

function calculatePercentFromTotals({ pointsEarned, totalPoints }: GradeTotals): number | null {
  if (totalPoints <= 0) {
    return null;
  }

  return (pointsEarned / totalPoints) * 100;
}

function calculateAdjustedPercentFromBaseline(
  baselinePercent: number | null | undefined,
  baselineTotals: GradeTotals,
  adjustedTotals: GradeTotals
): number | null {
  const adjustedPercent = calculatePercentFromTotals(adjustedTotals);
  if (adjustedPercent === null) {
    return baselineTotals.totalPoints <= 0 && isFiniteNumber(baselinePercent)
      ? baselinePercent
      : null;
  }

  if (!isFiniteNumber(baselinePercent)) {
    return adjustedPercent;
  }

  const baselinePointsPercent = calculatePercentFromTotals(baselineTotals);
  if (baselinePointsPercent === null) {
    return adjustedPercent;
  }

  if (
    baselineTotals.pointsEarned === adjustedTotals.pointsEarned &&
    baselineTotals.totalPoints === adjustedTotals.totalPoints
  ) {
    return baselinePercent;
  }

  // IC sometimes truncates a points-based percentage (8/12 as 66.66%).
  // Once the points change, use the exact points calculation when that is the
  // only difference, so full credit does not remain stuck at 99.99%.
  if (Math.abs(baselinePercent - baselinePointsPercent) < 0.01) {
    return adjustedPercent;
  }

  return baselinePercent + (adjustedPercent - baselinePointsPercent);
}

const CATEGORY_WEIGHT_TOLERANCE = 0.001;

function roundCategoryWeight(value: number) {
  return Math.round(value * 100) / 100;
}

function getKnownCategoryWeightScale(existingWeightTotal: number) {
  if (!Number.isFinite(existingWeightTotal) || existingWeightTotal <= 0) {
    return null;
  }

  if (existingWeightTotal <= 1 + CATEGORY_WEIGHT_TOLERANCE) {
    return 1;
  }

  if (existingWeightTotal <= 100 + CATEGORY_WEIGHT_TOLERANCE) {
    return 100;
  }

  return null;
}

export function getRemainingCategoryWeight(existingWeightTotal: number) {
  const weightScale = getKnownCategoryWeightScale(existingWeightTotal);

  if (weightScale === null) {
    return null;
  }

  const remainingWeight = roundCategoryWeight(weightScale - existingWeightTotal);

  return remainingWeight > CATEGORY_WEIGHT_TOLERANCE ? remainingWeight : null;
}

export function calculateCategoryPercent(category: ModifiedCategory): number | null {
  return calculateAdjustedPercentFromBaseline(
    category.progress?.progressPercent,
    getCategoryProgressTotals(category),
    getCategoryAdjustedProgressTotals(category)
  );
}

function normalizeScoreValue(score: string | null | undefined): string | null {
  if (score === null || score === undefined) return null;

  const trimmed = score.trim();
  return trimmed === '' ? null : trimmed;
}

function areEquivalentScores(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeScoreValue(left);
  const normalizedRight = normalizeScoreValue(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft === null || normalizedRight === null) {
    return false;
  }

  const parsedLeft = Number.parseFloat(normalizedLeft);
  const parsedRight = Number.parseFloat(normalizedRight);

  if (!Number.isFinite(parsedLeft) || !Number.isFinite(parsedRight)) {
    return false;
  }

  return parsedLeft === parsedRight;
}

function normalizeDroppedValue(dropped: boolean | null | undefined) {
  return dropped ?? false;
}

export function getCourseGradePercent(
  task: Pick<CourseGradeTask, 'progressPercent' | 'percent'>,
  fallbackPercent: number | null = null
) {
  return task.progressPercent ?? task.percent ?? fallbackPercent;
}

export function getCourseGradeBaseline(
  task: Pick<
    CourseGradeTask,
    'progressPercent' | 'percent' | 'progressPointsEarned' | 'progressTotalPoints'
  >,
  fallbackPercent: number | null = null
): RecalculateGradeOptions {
  return {
    baselinePercent: getCourseGradePercent(task, fallbackPercent),
    baselinePointsEarned: task.progressPointsEarned ?? null,
    baselineTotalPoints: task.progressTotalPoints ?? null,
  };
}

export function sanitizeWhatIfModifications(
  categories: CourseGradeCategory[],
  modifications: Map<number, WhatIfModification>
) {
  const assignmentsByID = new Map(
    categories.flatMap((category) =>
      category.assignments.map((assignment) => [assignment.objectSectionID, assignment] as const)
    )
  );
  const sanitizedModifications = new Map<number, WhatIfModification>();

  for (const [objectSectionID, modification] of modifications) {
    const assignment = assignmentsByID.get(objectSectionID);

    if (!assignment) {
      sanitizedModifications.set(objectSectionID, modification);
      continue;
    }

    const sanitizedModification: WhatIfModification = {};
    const pointInputValue = getAssignmentPointValue(assignment);
    const comparableScore =
      pointInputValue === null ? assignment.score : formatGradeNumber(pointInputValue);

    if (
      modification.score !== undefined &&
      !areEquivalentScores(modification.score, comparableScore)
    ) {
      sanitizedModification.score = modification.score;
    }

    if (
      modification.totalPoints !== undefined &&
      modification.totalPoints !== null &&
      modification.totalPoints !== assignment.totalPoints
    ) {
      sanitizedModification.totalPoints = modification.totalPoints;
    }

    if (
      modification.dropped !== undefined &&
      normalizeDroppedValue(modification.dropped) !== normalizeDroppedValue(assignment.dropped)
    ) {
      sanitizedModification.dropped = modification.dropped;
    }

    if (
      sanitizedModification.score !== undefined ||
      sanitizedModification.totalPoints !== undefined ||
      sanitizedModification.dropped !== undefined
    ) {
      sanitizedModifications.set(objectSectionID, sanitizedModification);
    }
  }

  return sanitizedModifications;
}

export function applyWhatIfModifications(
  categories: CourseGradeCategory[],
  modifications: Map<number, WhatIfModification>,
  virtualAssignments: VirtualAssignment[] = [],
  virtualCategories: VirtualCategory[] = []
): ModifiedCategory[] {
  const createVirtualAssignments = (groupID: number) =>
    virtualAssignments
      .filter((va) => va.groupID === groupID)
      .map((va) => {
        return {
          objectSectionID: va.objectSectionID,
          assignmentName: va.assignmentName,
          sectionID: 0,
          dueDate: new Date().toISOString(),
          assignedDate: new Date().toISOString(),
          scoreModifiedDate: new Date().toISOString(),
          termIDs: [],
          score: va.score,
          scorePoints: va.score,
          scorePercentage: calculateAssignmentPercentage(va.score, va.totalPoints),
          scoringType: 'p',
          totalPoints: va.totalPoints,
          comments: null,
          feedback: null,
          late: null,
          missing: null,
          dropped: va.dropped ?? null,
          incomplete: null,
          turnedIn: null,
          notGraded: false,
          multiplier: 1,
          isModified: true,
          originalScore: null,
          originalScorePoints: null,
          originalScorePercentage: null,
          originalScoringType: null,
          originalTotalPoints: null,
          originalDropped: null,
        } as ModifiedAssignment;
      });

  const mergedExistingCategories = categories.map((category) => {
    const modifiedAssignments = category.assignments.map((assignment) => {
      const mod = modifications.get(assignment.objectSectionID);
      const isModified =
        !!mod &&
        (mod.score !== undefined || mod.totalPoints !== undefined || mod.dropped !== undefined);

      let modifiedScore = assignment.score;
      let modifiedScorePoints = assignment.scorePoints;
      let modifiedScorePercentage = assignment.scorePercentage;
      let modifiedScoringType = assignment.scoringType;
      let modifiedTotalPoints = assignment.totalPoints;
      let modifiedDropped = assignment.dropped;

      if (mod) {
        const hasTotalPointsModification =
          mod.totalPoints !== undefined && mod.totalPoints !== null && mod.totalPoints >= 0;
        const hasScoreModification = mod.score !== undefined;

        if (hasTotalPointsModification) {
          modifiedTotalPoints = mod.totalPoints as number;
        }
        if (hasScoreModification || hasTotalPointsModification) {
          const originalPointValue = getAssignmentPointValue(assignment);
          const pointScore = hasScoreModification
            ? (mod.score ?? null)
            : originalPointValue === null
              ? assignment.score
              : formatGradeNumber(originalPointValue);
          modifiedScore = pointScore;
          modifiedScorePoints = pointScore;
          modifiedScorePercentage = calculateAssignmentPercentage(
            modifiedScore,
            modifiedTotalPoints
          );
          modifiedScoringType = 'p';
        }
        if (mod.dropped !== undefined) {
          modifiedDropped = mod.dropped;
        }
      }

      return {
        ...assignment,
        score: modifiedScore,
        scorePoints: modifiedScorePoints,
        scorePercentage: modifiedScorePercentage,
        scoringType: modifiedScoringType,
        totalPoints: modifiedTotalPoints,
        dropped: modifiedDropped,
        isModified,
        originalScore: assignment.score,
        originalScorePoints: assignment.scorePoints,
        originalScorePercentage: assignment.scorePercentage,
        originalScoringType: assignment.scoringType,
        originalTotalPoints: assignment.totalPoints,
        originalDropped: assignment.dropped,
      };
    });

    return {
      ...category,
      assignments: [...modifiedAssignments, ...createVirtualAssignments(category.groupID)],
      isVirtual: false,
    };
  });

  const appendedVirtualCategories: ModifiedCategory[] = virtualCategories.map((category) => ({
    groupID: category.groupID,
    name: category.name,
    weight: category.weight,
    progress: null,
    assignments: createVirtualAssignments(category.groupID),
    isVirtual: true,
  }));

  return [...mergedExistingCategories, ...appendedVirtualCategories];
}

function sumCategoryTotals(
  categories: ModifiedCategory[],
  getTotals: (category: ModifiedCategory) => GradeTotals
): GradeTotals {
  return categories.reduce((sum, category) => addTotals(sum, getTotals(category)), {
    pointsEarned: 0,
    totalPoints: 0,
  });
}

function getBaselineCourseTotals(
  categories: ModifiedCategory[],
  options?: RecalculateGradeOptions
): GradeTotals {
  if (
    isFiniteNumber(options?.baselinePointsEarned) &&
    isFiniteNumber(options?.baselineTotalPoints)
  ) {
    return {
      pointsEarned: options.baselinePointsEarned,
      totalPoints: options.baselineTotalPoints,
    };
  }

  return sumCategoryTotals(categories, getCategoryProgressTotals);
}

function calculateWeightedGrade(
  categories: ModifiedCategory[],
  getTotals: (category: ModifiedCategory) => GradeTotals
) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const category of categories) {
    const categoryPercent = calculateAdjustedPercentFromBaseline(
      category.progress?.progressPercent,
      getCategoryProgressTotals(category),
      getTotals(category)
    );

    if (categoryPercent !== null) {
      weightedSum += categoryPercent * category.weight;
      totalWeight += category.weight;
    }
  }

  return {
    percent: totalWeight > 0 ? weightedSum / totalWeight : null,
    totalWeight,
    weightedSum,
  };
}

export function recalculateGrade(
  categories: ModifiedCategory[],
  isWeighted: boolean,
  options?: RecalculateGradeOptions
): { percent: number; pointsEarned: number; totalPoints: number } {
  if (isWeighted) {
    const baseWeightedGrade = calculateWeightedGrade(categories, getCategoryProgressTotals);
    const adjustedWeightedGrade = calculateWeightedGrade(
      categories,
      getCategoryAdjustedProgressTotals
    );
    const adjustedTotals = sumCategoryTotals(categories, getCategoryAdjustedProgressTotals);
    const baselinePercent = options?.baselinePercent;

    let percent = adjustedWeightedGrade.percent ?? baselinePercent ?? 0;

    if (
      isFiniteNumber(baselinePercent) &&
      baseWeightedGrade.percent !== null &&
      adjustedWeightedGrade.percent !== null &&
      baseWeightedGrade.totalWeight > 0 &&
      adjustedWeightedGrade.totalWeight > 0
    ) {
      percent =
        (baselinePercent * baseWeightedGrade.totalWeight +
          (adjustedWeightedGrade.weightedSum - baseWeightedGrade.weightedSum)) /
        adjustedWeightedGrade.totalWeight;
    }

    return {
      percent,
      pointsEarned: adjustedTotals.pointsEarned,
      totalPoints: adjustedTotals.totalPoints,
    };
  } else {
    const baselineTotals = getBaselineCourseTotals(categories, options);
    const adjustedTotals = addTotals(
      baselineTotals,
      sumCategoryTotals(categories, getCategoryDeltaTotals)
    );
    const percent =
      calculateAdjustedPercentFromBaseline(
        options?.baselinePercent,
        baselineTotals,
        adjustedTotals
      ) ?? 0;

    return {
      percent,
      pointsEarned: adjustedTotals.pointsEarned,
      totalPoints: adjustedTotals.totalPoints,
    };
  }
}

export function dropAssignmentFromCalculation(
  categories: ModifiedCategory[],
  targetObjectSectionID: number
) {
  return categories.map((category) => ({
    ...category,
    assignments: category.assignments.map((assignment) =>
      assignment.objectSectionID === targetObjectSectionID
        ? { ...assignment, score: null, scorePoints: null, scorePercentage: null, dropped: true }
        : assignment
    ),
  }));
}

function calculateGradeWithoutAssignment(
  categories: ModifiedCategory[],
  targetObjectSectionID: number,
  isWeighted: boolean,
  options?: RecalculateGradeOptions
): number {
  return recalculateGrade(
    dropAssignmentFromCalculation(categories, targetObjectSectionID),
    isWeighted,
    options
  ).percent;
}

function calculateGradeWithDropToggled(
  categories: ModifiedCategory[],
  targetObjectSectionID: number,
  isWeighted: boolean,
  options?: RecalculateGradeOptions
): number {
  const categoriesWithToggledDrop = categories.map((category) => ({
    ...category,
    assignments: category.assignments.map((assignment) =>
      assignment.objectSectionID === targetObjectSectionID
        ? { ...assignment, dropped: !assignment.dropped }
        : assignment
    ),
  }));

  return recalculateGrade(categoriesWithToggledDrop, isWeighted, options).percent;
}

export function calculatePercentImpact(
  assignment: ModifiedAssignment,
  categories: ModifiedCategory[],
  isWeighted: boolean,
  currentPercent: number | null,
  options?: RecalculateGradeOptions
): number {
  if (!hasCountedScoreOrMissing(assignment) || assignment.notGraded || currentPercent === null) {
    return 0;
  }

  const projectedGrade = assignment.dropped
    ? calculateGradeWithDropToggled(categories, assignment.objectSectionID, isWeighted, options)
    : calculateGradeWithoutAssignment(categories, assignment.objectSectionID, isWeighted, options);

  return projectedGrade - currentPercent;
}

export function calculatePercentImpactFromRaw(
  assignment: CourseGradeAssignment,
  categories: CourseGradeCategory[],
  isWeighted: boolean,
  currentPercent: number | null,
  options?: RecalculateGradeOptions
): number {
  if (!hasCountedScoreOrMissing(assignment) || assignment.notGraded || currentPercent === null) {
    return 0;
  }

  const modifiedCategories: ModifiedCategory[] = categories.map((cat) => ({
    ...cat,
    assignments: cat.assignments.map((a) => ({
      ...a,
      isModified: false,
      originalScore: a.score,
      originalScorePoints: a.scorePoints,
      originalScorePercentage: a.scorePercentage,
      originalScoringType: a.scoringType,
      originalTotalPoints: a.totalPoints,
      originalDropped: a.dropped,
    })),
  }));

  const projectedGrade = assignment.dropped
    ? calculateGradeWithDropToggled(
        modifiedCategories,
        assignment.objectSectionID,
        isWeighted,
        options
      )
    : calculateGradeWithoutAssignment(
        modifiedCategories,
        assignment.objectSectionID,
        isWeighted,
        options
      );

  return projectedGrade - currentPercent;
}
