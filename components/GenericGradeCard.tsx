import { ReactNode, useMemo, useState, useRef } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, { LinearTransition, runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import AnimatedNumbers from 'react-native-animated-numbers';
import { LineChart } from 'react-native-wagmi-charts';
import type { CourseGradeCategory } from '@/api/src/types';
import { isNonPointsScoringType } from '@/api/src/assignment-score';
import {
  calculatePercentImpact,
  isCountedGradeAssignment,
  recalculateGrade,
  type ModifiedCategory,
  type RecalculateGradeOptions,
} from '@/utils/grade-calculator';
import { playHaptic } from '@/utils/haptics';

type CourseGradeCardProps = {
  taskName: string;
  displayPercent: number | null;
  /** IC's letter/mark, shown when the course has no percentage. */
  displayScore?: string | null;
  percentChange: number | null;
  hasModifications: boolean;
  updatedAt?: string | null;
  actionSlot?: ReactNode;
  chartCategories?: CourseGradeCategory[];
  gradeBaseline?: RecalculateGradeOptions;
  isWeighted?: boolean;
  variant?: 'default' | 'chart';
};

type GradeHistoryPoint = {
  assignmentName: string;
  impact: number;
  scoreLabel: string;
  timestamp: number;
  value: number;
};

const POSITIVE_IMPACT_COLOR = '#00c950';

const formatRelativeDate = (dateString: string | null | undefined) => {
  if (!dateString) return null;

  const date = new Date(dateString);

  const datePart = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `Updated ${datePart} @ ${timePart}`;
};

const formatRelativeTime = (dateString: string | null | undefined) => {
  if (!dateString) return null;

  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();

  if (!Number.isFinite(diffMs)) {
    return null;
  }

  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }

  if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  if (diffMinutes > 0) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }

  return 'just now';
};

function roundToHundredths(value: number) {
  return Math.round(value * 100) / 100;
}

function createModifiedCategories(categories: CourseGradeCategory[]): ModifiedCategory[] {
  return categories.map((category) => ({
    ...category,
    assignments: category.assignments.map((assignment) => ({
      ...assignment,
      isModified: false,
      originalScore: assignment.score,
      originalScorePoints: assignment.scorePoints,
      originalScorePercentage: assignment.scorePercentage,
      originalScoringType: assignment.scoringType,
      originalTotalPoints: assignment.totalPoints,
      originalDropped: assignment.dropped,
    })),
  }));
}

function removeAssignmentFromWorkingSet(
  categories: ModifiedCategory[],
  objectSectionID: number
): ModifiedCategory[] {
  return categories.map((category) => ({
    ...category,
    assignments: category.assignments.map((assignment) =>
      assignment.objectSectionID === objectSectionID
        ? {
            ...assignment,
            score: null,
            scorePoints: null,
            scorePercentage: null,
            dropped: true,
          }
        : assignment
    ),
  }));
}

function formatScoreLabel(assignment: CourseGradeCategory['assignments'][number]) {
  if (isNonPointsScoringType(assignment.scoringType)) {
    const percent = assignment.scorePercentage ? ` (${assignment.scorePercentage}%)` : '';
    return `${assignment.score ?? '—'}${percent}`;
  }
  return `${assignment.scorePoints ?? assignment.score ?? 0}/${assignment.totalPoints}`;
}

function buildGradeHistoryPoints(
  categories: CourseGradeCategory[],
  isWeighted: boolean,
  gradeBaseline?: RecalculateGradeOptions
) {
  const assignments = categories
    .flatMap((category) => category.assignments)
    .filter((assignment) => {
      if (!isCountedGradeAssignment(assignment)) {
        return false;
      }

      return Number.isFinite(Date.parse(assignment.scoreModifiedDate ?? ''));
    })
    .map((assignment, index) => ({
      assignment,
      originalIndex: index,
      timestamp: Date.parse(assignment.scoreModifiedDate!),
    }))
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp;
      }

      return right.originalIndex - left.originalIndex;
    });

  if (assignments.length < 2) {
    return [];
  }

  let workingCategories = createModifiedCategories(categories);
  const duplicateTimestamps = new Map<number, number>();
  const points: GradeHistoryPoint[] = [];

  for (const { assignment, timestamp } of assignments) {
    const workingAssignment = workingCategories
      .flatMap((category) => category.assignments)
      .find((candidate) => candidate.objectSectionID === assignment.objectSectionID);

    if (!workingAssignment) {
      continue;
    }

    const currentGrade = recalculateGrade(workingCategories, isWeighted, gradeBaseline).percent;
    const inverseImpact = -calculatePercentImpact(
      workingAssignment,
      workingCategories,
      isWeighted,
      currentGrade,
      gradeBaseline
    );
    const duplicateOffset = duplicateTimestamps.get(timestamp) ?? 0;

    duplicateTimestamps.set(timestamp, duplicateOffset + 1);
    points.push({
      assignmentName: assignment.assignmentName,
      impact: roundToHundredths(inverseImpact),
      scoreLabel: formatScoreLabel(assignment),
      timestamp: timestamp + duplicateOffset,
      value: roundToHundredths(currentGrade),
    });

    workingCategories = removeAssignmentFromWorkingSet(
      workingCategories,
      assignment.objectSectionID
    );
  }

  return points.reverse();
}

function buildYRange(points: GradeHistoryPoint[]) {
  if (points.length === 0) {
    return { min: 0, max: 1 };
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const paddedMin = Math.max(0, min - 1);
  const paddedMax = Math.min(100, max + 1);

  return paddedMin === paddedMax
    ? { min: paddedMin, max: paddedMax + 1 }
    : { min: paddedMin, max: paddedMax };
}

function formatTooltipDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function ChartSelectionBridge({
  points,
  onPointChange,
}: {
  points: GradeHistoryPoint[];
  onPointChange: (point: GradeHistoryPoint | null) => void;
}) {
  const { currentIndex, isActive } = LineChart.useChart();

  useAnimatedReaction(
    () => ({
      index: currentIndex.value,
      active: isActive.value,
    }),
    (nextState, previousState) => {
      if (
        previousState &&
        nextState.index === previousState.index &&
        nextState.active === previousState.active
      ) {
        return;
      }

      if (!nextState.active) {
        runOnJS(onPointChange)(null);
        return;
      }

      const point =
        nextState.index < 0
          ? null
          : (points[Math.max(0, Math.min(points.length - 1, Math.round(nextState.index)))] ?? null);

      runOnJS(onPointChange)(point);
    },
    [currentIndex, isActive, onPointChange, points]
  );

  return null;
}

function splitFixedNumber(value: number, digits = 2) {
  const fixed = Math.abs(value).toFixed(digits);
  const [, fraction] = fixed.split('.');
  return { fraction };
}

function AnimatedPercentNumber({
  value,
  color,
  size,
  weight,
  showPlus = false,
}: {
  value: number;
  color: string;
  size: number;
  weight: '600' | '700';
  showPlus?: boolean;
}) {
  const sign = value < 0 ? '-' : showPlus && value > 0 ? '+' : '';
  const { fraction } = splitFixedNumber(value);
  const whole = Math.trunc(Math.abs(value));

  return (
    <View className="flex-row items-baseline">
      {sign ? <Text style={{ color, fontSize: size, fontWeight: weight }}>{sign}</Text> : null}
      <AnimatedNumbers
        animateToNumber={whole}
        animationDuration={500}
        includeComma={false}
        fontStyle={{
          color,
          fontSize: size,
          fontWeight: weight,
        }}
      />
      <Text style={{ color, fontSize: size, fontWeight: weight }}>.{fraction}%</Text>
    </View>
  );
}

export function GenericGradeCard({
  taskName,
  displayPercent,
  displayScore,
  percentChange,
  hasModifications,
  updatedAt,
  actionSlot,
  chartCategories,
  gradeBaseline,
  isWeighted = false,
  variant = 'default',
}: CourseGradeCardProps) {
  const { width } = useWindowDimensions();
  const historyPoints = useMemo(
    () =>
      chartCategories ? buildGradeHistoryPoints(chartCategories, isWeighted, gradeBaseline) : [],
    [chartCategories, gradeBaseline, isWeighted]
  );
  const chartData = useMemo(
    () => historyPoints.map(({ timestamp, value }) => ({ timestamp, value })),
    [historyPoints]
  );
  const yRange = useMemo(() => buildYRange(historyPoints), [historyPoints]);
  const xDomain = useMemo(() => {
    if (chartData.length < 2) {
      return undefined;
    }

    return [chartData[0].timestamp, chartData[chartData.length - 1].timestamp] as [number, number];
  }, [chartData]);
  const [selectedPoint, setSelectedPoint] = useState<GradeHistoryPoint | null>(null);
  const lastHapticTimestampRef = useRef<number | null>(null);

  const handlePointChange = (point: GradeHistoryPoint | null) => {
    if (point && point.timestamp !== lastHapticTimestampRef.current) {
      playHaptic('selection');
      lastHapticTimestampRef.current = point.timestamp;
    }

    if (point === null) {
      lastHapticTimestampRef.current = null;
    }

    setSelectedPoint(point);
  };

  const chartWidth = Math.max(width - 104, 220);
  const showChart = variant === 'chart' && historyPoints.length >= 2;
  const defaultImpact = historyPoints[historyPoints.length - 1]?.impact ?? percentChange;
  const gradeColor = hasModifications ? '#fbbf24' : '#f5f5f4';
  const impactValue = showChart ? (selectedPoint?.impact ?? defaultImpact) : percentChange;
  const isShowingDefaultChartState = showChart && selectedPoint === null;
  const showModifiedImpactPill =
    isShowingDefaultChartState && hasModifications && percentChange !== null;
  const impactColor =
    impactValue === null || impactValue === 0
      ? '#78716c'
      : impactValue > 0
        ? POSITIVE_IMPACT_COLOR
        : '#f87171';
  const updatedDisplay = formatRelativeDate(updatedAt);
  const updatedRelativeDisplay = formatRelativeTime(updatedAt);
  const gradeValue = showChart && selectedPoint ? selectedPoint.value : displayPercent;
  const formattedDisplayPercent =
    displayPercent !== null ? `${roundToHundredths(displayPercent)}%` : displayScore || '—';
  const formattedPercentChange =
    percentChange === null || percentChange === 0
      ? null
      : percentChange > 0
        ? `+${roundToHundredths(percentChange)}%`
        : `${roundToHundredths(percentChange)}%`;

  if (variant === 'default') {
    return (
      <View className="mb-6 rounded-2xl border border-stone-700 p-5">
        <View className="mb-4 flex-row items-start justify-between">
          <Text className="tracking-medium flex-1 pr-3 text-lg text-stone-400">{taskName}</Text>
          {actionSlot ? <View className="-mr-2 -mt-1">{actionSlot}</View> : null}
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text
              className={`text-5xl font-bold ${hasModifications ? 'text-amber-400' : 'text-green-500'}`}>
              {formattedDisplayPercent}
            </Text>
          </View>

          {formattedPercentChange ? (
            <View
              className={`flex-row items-center rounded-md px-2 py-1 ${
                percentChange! > 0 ? 'bg-green-600' : 'bg-red-600'
              }`}>
              <Text className="ml-1 text-lg font-semibold text-white">
                {formattedPercentChange}
              </Text>
            </View>
          ) : null}
        </View>

        {updatedDisplay ? (
          <Text className="mt-4 text-base text-stone-500">{updatedDisplay}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="mb-5 rounded-2xl border border-stone-700 p-4">
      <View className="mb-2 flex-row items-start justify-between">
        <Text className="tracking-medium flex-1 pr-3 text-base text-stone-400">{taskName}</Text>
        {actionSlot ? <View className="-mr-2 -mt-1">{actionSlot}</View> : null}
      </View>

      <Animated.View layout={LinearTransition.duration(140)}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            {gradeValue !== null ? (
              <AnimatedPercentNumber value={gradeValue} color={gradeColor} size={40} weight="700" />
            ) : (
              <Text
                className={`text-[40px] font-bold ${
                  hasModifications ? 'text-amber-400' : 'text-stone-50'
                }`}>
                {displayScore || '—'}
              </Text>
            )}
          </View>
        </View>

        <View className="mt-1 min-h-[24px] justify-center">
          {showModifiedImpactPill ? (
            <View className="flex-row items-center">
              <View
                className={`self-start rounded-md px-2 py-0.5 ${
                  percentChange > 0
                    ? 'bg-green-600'
                    : percentChange < 0
                      ? 'bg-red-600'
                      : 'bg-stone-700'
                }`}>
                <AnimatedPercentNumber
                  value={percentChange}
                  color="#ffffff"
                  size={17}
                  weight="600"
                  showPlus
                />
              </View>
              <Text className="text-md ml-2 font-medium text-stone-400">Edited</Text>
            </View>
          ) : isShowingDefaultChartState && !hasModifications ? (
            impactValue !== null ? (
              <View className="flex-row items-center">
                <AnimatedPercentNumber
                  value={impactValue}
                  color={impactColor}
                  size={17}
                  weight="600"
                  showPlus
                />
                {updatedRelativeDisplay ? (
                  <Text className="text-md ml-2 font-medium text-stone-400">
                    {updatedRelativeDisplay}
                  </Text>
                ) : null}
              </View>
            ) : updatedDisplay ? (
              <Text className="text-sm font-medium text-stone-500">—</Text>
            ) : null
          ) : !isShowingDefaultChartState ? (
            impactValue !== null ? (
              <AnimatedPercentNumber
                value={impactValue}
                color={impactColor}
                size={17}
                weight="600"
                showPlus
              />
            ) : updatedDisplay ? (
              <Text className="text-sm font-medium text-stone-500">—</Text>
            ) : null
          ) : null}
        </View>
      </Animated.View>

      {showChart ? (
        <View className="mt-2 h-[96px] justify-center">
          <LineChart.Provider data={chartData} xDomain={xDomain} yRange={yRange}>
            <ChartSelectionBridge points={historyPoints} onPointChange={handlePointChange} />
            <LineChart height={96} width={chartWidth} yGutter={12} style={{ alignSelf: 'center' }}>
              <LineChart.Path color={POSITIVE_IMPACT_COLOR} width={3} />
              <LineChart.CursorCrosshair
                color="#ffffff"
                outerSize={18}
                size={8}
                snapToPoint
                onEnded={() => handlePointChange(null)}>
                <LineChart.Tooltip position="bottom" cursorGutter={18} xGutter={8} yGutter={10}>
                  <View className="rounded-lg border border-stone-700 bg-neutral-900/95 px-3 py-2">
                    <Text className="max-w-44 text-xs font-medium text-stone-100" numberOfLines={1}>
                      {selectedPoint?.assignmentName}
                    </Text>
                    <Text className="mt-0.5 text-[11px] text-stone-500">
                      {selectedPoint?.scoreLabel} •{' '}
                      {selectedPoint ? formatTooltipDate(selectedPoint.timestamp) : ''}
                    </Text>
                  </View>
                </LineChart.Tooltip>
              </LineChart.CursorCrosshair>
              <LineChart.Dot
                color={POSITIVE_IMPACT_COLOR}
                hasOuterDot
                at={historyPoints.length - 1}
                size={6}
              />
            </LineChart>
          </LineChart.Provider>
        </View>
      ) : updatedDisplay ? (
        <View className="mt-3 min-h-[20px] justify-center">
          <Text className="text-sm text-stone-500">{updatedDisplay}</Text>
        </View>
      ) : (
        <View className="mt-3 min-h-[20px]" />
      )}
    </View>
  );
}
