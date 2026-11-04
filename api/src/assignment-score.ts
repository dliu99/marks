export type AssignmentScoreFields = {
  score: string | null | undefined;
  scorePoints: string | null | undefined;
  scorePercentage: string | null | undefined;
  totalPoints: number;
  scoringType: string | null | undefined;
};

export function parseGradeNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isNonPointsScoringType(scoringType: string | null | undefined) {
  const normalized = scoringType?.trim().toLowerCase();
  return normalized != null && normalized !== '' && normalized !== 'p';
}

/**
 * Return the point value IC uses for aggregation without deriving a mark-to-point
 * mapping ourselves. Explicit scorePoints wins; otherwise IC's percentage is
 * applied to the assignment denominator. Raw score is only a point value when
 * IC identifies the assignment as point-scored (or older payloads omit the type).
 */
export function getAssignmentPointValue(assignment: AssignmentScoreFields): number | null {
  const scorePoints = parseGradeNumber(assignment.scorePoints);
  if (scorePoints !== null) return scorePoints;

  const percentage = parseGradeNumber(assignment.scorePercentage);
  if (percentage !== null && assignment.totalPoints > 0) {
    return (percentage / 100) * assignment.totalPoints;
  }

  if (!isNonPointsScoringType(assignment.scoringType)) {
    return parseGradeNumber(assignment.score);
  }

  return null;
}

export function formatGradeNumber(value: number) {
  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function getAssignmentPointInputValue(assignment: AssignmentScoreFields) {
  const pointValue = getAssignmentPointValue(assignment);
  return pointValue === null ? null : formatGradeNumber(pointValue);
}

export function hasAssignmentScore(assignment: AssignmentScoreFields) {
  return (
    parseGradeNumber(assignment.scorePoints) !== null ||
    parseGradeNumber(assignment.scorePercentage) !== null ||
    (assignment.score !== null && assignment.score !== undefined && assignment.score.trim() !== '')
  );
}
