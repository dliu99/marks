import { memo, useCallback, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Assignment } from '@/api/src/types';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { playHaptic } from '@/utils/haptics';
import { openAssignmentModal } from '@/utils/assignment-modal-navigation';
import {
  formatGradeNumber,
  hasAssignmentScore,
  isNonPointsScoringType,
  parseGradeNumber,
} from '@/api/src/assignment-score';

type AssignmentCardProps = {
  assignment: Assignment;
  courseName?: string;
  compact?: boolean;
  now: dayjs.Dayjs;
};

function formatRelativeTime(dueDate: dayjs.Dayjs, now: dayjs.Dayjs): string {
  const diffHours = dueDate.diff(now, 'hour');
  const diffDays = dueDate.startOf('day').diff(now.startOf('day'), 'day');
  if (diffDays < 0) {
    return `${Math.abs(diffDays)}d ago`;
  }
  if (diffHours < 1) {
    const diffMinutes = dueDate.diff(now, 'minute');
    if (diffMinutes <= 0) return 'now';
    return `in ${diffMinutes}m`;
  }

  if (diffHours < 24 && diffDays === 0) {
    return `in ${diffHours}h`;
  }

  if (diffDays === 0) {
    return 'today';
  }

  if (diffDays === 1) {
    return 'in 1d';
  }

  return `in ${diffDays}d`;
}

function formatElapsedTime(date: dayjs.Dayjs, now: dayjs.Dayjs): string {
  const diffMinutes = now.diff(date, 'minute');
  const diffHours = now.diff(date, 'hour');
  const diffDays = now.startOf('day').diff(date.startOf('day'), 'day');

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  }
  if (diffHours > 0) {
    return `${diffHours}h ago`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  }
  return 'now';
}

function AssignmentCardComponent({ assignment, courseName, compact, now }: AssignmentCardProps) {
  const router = useRouter();
  const dueDate = useMemo(() => dayjs(assignment.dueDate), [assignment.dueDate]);
  const relativeTime = useMemo(() => formatRelativeTime(dueDate, now), [dueDate, now]);
  const gradedAt = useMemo(
    () => (assignment.scoreModifiedDate ? dayjs(assignment.scoreModifiedDate) : null),
    [assignment.scoreModifiedDate]
  );
  const gradedAtLabel = gradedAt?.isValid() ? gradedAt.format('h:mm A') : null;
  const gradedRelativeTime = useMemo(
    () => (gradedAt?.isValid() ? formatElapsedTime(gradedAt, now) : null),
    [gradedAt, now]
  );
  const isNonPointsScore = isNonPointsScoringType(assignment.scoringType);
  const scoreValue = isNonPointsScore
    ? (assignment.score ?? assignment.scorePoints)
    : (assignment.scorePoints ?? assignment.score);
  const percentageValue = parseGradeNumber(assignment.scorePercentage);
  const percentage = percentageValue === null ? '' : ` (${formatGradeNumber(percentageValue)}%)`;
  const showsPoints = !isNonPointsScore;
  const gradeDisplay = showsPoints
    ? `${scoreValue ?? '—'}/${assignment.totalPoints}`
    : `${scoreValue ?? '—'}${percentage}`;
  const hasGrade = Boolean(gradedAtLabel && hasAssignmentScore(assignment));
  const hasTotalPoints = assignment.totalPoints != null;
  const hasComment = Boolean(assignment.comments?.trim());

  const handlePress = useCallback(() => {
    playHaptic('navigation');
    openAssignmentModal(router, assignment.objectSectionID, assignment.assignmentName);
  }, [assignment.assignmentName, assignment.objectSectionID, router]);

  void compact;

  return (
    <Pressable
      onPress={handlePress}
      className="mb-4 rounded-2xl border border-stone-700 p-5 active:scale-[0.97] active:opacity-80">
      <View className="flex-row items-start justify-between">
        <View className="mr-4 flex-1">
          <Text className="text-xl font-semibold leading-snug text-white" numberOfLines={2}>
            {assignment.assignmentName}
          </Text>
          {courseName && (
            <Text className="mt-2 text-base text-stone-400" numberOfLines={1}>
              {courseName}
            </Text>
          )}
          {hasGrade ? (
            <Text className="mt-1 text-base text-stone-500">
              <Text className="text-base text-green-500">{gradeDisplay}</Text>{' '}
              {showsPoints ? 'pts • ' : '• '}
              <Text className="text-base text-green-500">graded {gradedRelativeTime}</Text> @{' '}
              {gradedAtLabel}
            </Text>
          ) : hasTotalPoints ? (
            <Text className="mt-1 text-base text-stone-500">
              {assignment.totalPoints} pts •{' '}
              {relativeTime.endsWith('ago') ? (
                <Text className="text-base text-red-500">{relativeTime}</Text>
              ) : (
                <Text className="text-base text-green-500">{relativeTime}</Text>
              )}{' '}
              <Text className="text-base text-stone-500">@ {dueDate.format('h:mm A')}</Text>
            </Text>
          ) : null}
          {assignment.notGraded && (
            <Text className="mt-1 text-base text-stone-500">Not included in grades</Text>
          )}
        </View>
        <View className="items-center justify-center gap-2">
          <Ionicons name="arrow-forward" size={24} color="#ffffff" />
          {hasComment && <Text className="text-sm">💬</Text>}
        </View>
      </View>
    </Pressable>
  );
}

export const AssignmentCard = memo(AssignmentCardComponent);
