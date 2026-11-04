import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { CourseGradeAssignment } from '@/api/src/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { playHaptic } from '@/utils/haptics';
import { openAssignmentModal } from '@/utils/assignment-modal-navigation';
import { hasAssignmentScore, isNonPointsScoringType } from '@/api/src/assignment-score';

dayjs.extend(relativeTime);

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
}

type GradeCardProps = {
  assignment: CourseGradeAssignment;
  percentImpact?: number;
  isModified?: boolean;
  isVirtual?: boolean;
  isCategory?: boolean;
  onEditGradePress?: () => void;
};

function GradeCardComponent({
  assignment,
  percentImpact,
  isModified,
  isVirtual,
  isCategory,
  onEditGradePress,
}: GradeCardProps) {
  const router = useRouter();
  const handleEditGradePress = useCallback(() => {
    playHaptic('selection');
    onEditGradePress?.();
  }, [onEditGradePress]);

  const handleOpenAssignment = useCallback(() => {
    if (isVirtual) {
      return;
    }

    playHaptic('navigation');
    openAssignmentModal(router, assignment.objectSectionID, assignment.assignmentName);
  }, [assignment.assignmentName, assignment.objectSectionID, isVirtual, router]);

  const isNonPointsScore = isNonPointsScoringType(assignment.scoringType);
  const scoreDisplay = isNonPointsScore
    ? (assignment.score ?? assignment.scorePoints ?? '—')
    : (assignment.scorePoints ?? assignment.score ?? '—');
  const parsedPercent = Number.parseFloat(assignment.scorePercentage ?? '');
  const percentDisplay = Number.isFinite(parsedPercent)
    ? Math.round(parsedPercent * 100) / 100
    : null;
  const shouldShowMultiplier = assignment.multiplier != null && assignment.multiplier !== 1;
  // Rubric-scored assignments can have no point value; show the mark alone.
  const hasTotalPoints =
    assignment.totalPoints != null && (!isNonPointsScore || assignment.totalPoints > 0);
  const showTotalPoints = !isNonPointsScore && assignment.totalPoints != null;

  const getScoreColor = () => {
    if (assignment.dropped) return 'text-stone-500';
    if (assignment.missing) return 'text-red-400';
    if (!hasAssignmentScore(assignment)) return 'text-stone-500';
    if (isModified) return 'text-amber-400';
    return 'text-stone-50';
  };

  const getImpactColor = () => {
    if (percentImpact === undefined || percentImpact === 0) return 'text-stone-500';
    if (percentImpact > 0) return 'text-green-400';
    return 'text-red-400';
  };

  const formatImpact = () => {
    if (percentImpact === undefined) return null;
    if (percentImpact === 0) return null;
    const rounded = Math.round(percentImpact * 100) / 100;
    return percentImpact > 0 ? `+${rounded}%` : `${rounded}%`;
  };

  const getBorderColor = () => {
    if (isModified) return 'border-amber-500/50';
    return 'border-stone-700';
  };

  const containerClass = isCategory
    ? 'py-3 px-2'
    : `rounded-2xl p-5 border ${getBorderColor()} mb-3 active:scale-[0.97] active:opacity-80`;

  return (
    <Pressable
      accessibilityRole="button"
      className={containerClass}
      disabled={isVirtual}
      onPress={handleOpenAssignment}>
      <View className="flex-row items-center justify-between">
        <View className="mr-4 flex-1">
          <Text
            className={`text-xl font-semibold leading-snug ${assignment.dropped ? 'text-stone-500 line-through' : 'text-stone-50'}`}
            numberOfLines={2}>
            {assignment.assignmentName}
          </Text>
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            {assignment.missing && (
              <View className="rounded bg-red-500/20 px-2 py-0.5">
                <Text className="text-sm font-medium text-red-400">Missing</Text>
              </View>
            )}
            {assignment.late && (
              <View className="rounded bg-orange-500/20 px-2 py-0.5">
                <Text className="text-sm font-medium text-orange-400">Late</Text>
              </View>
            )}
            {isVirtual && (
              <View className="rounded bg-amber-500/20 px-2 py-0.5">
                <Text className="text-sm font-medium text-amber-400">Modified</Text>
              </View>
            )}
            {Boolean(assignment.comments?.trim()) && <Text className="text-sm">💬</Text>}
            <Text className="text-base text-stone-500">
              {hasTotalPoints ? `${formatNumber(assignment.totalPoints)} pts` : ''}
              {shouldShowMultiplier ? ` (${formatNumber(assignment.multiplier)}x)` : ''}
              {hasTotalPoints || shouldShowMultiplier ? ' • ' : ''}
              {assignment.scoreModifiedDate
                ? dayjs(assignment.scoreModifiedDate).fromNow()
                : '—'}{' '}
              {formatImpact() && (
                <Text
                  className={`text-base font-medium ${isModified ? 'text-amber-400' : getImpactColor()}`}>
                  {formatImpact()}
                </Text>
              )}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center justify-center gap-2">
          <View className="mr-1 items-end justify-center">
            <TouchableOpacity
              activeOpacity={0.8}
              className="rounded-lg bg-stone-800 px-3 py-2"
              onPress={handleEditGradePress}>
              <View className="flex-row items-center">
                <Text
                  className={`text-center text-xl font-bold ${
                    isModified ? 'text-amber-400' : 'text-stone-100'
                  }`}>
                  {scoreDisplay}
                </Text>
                {showTotalPoints ? (
                  <>
                    <Text className="mx-1 text-xl font-bold text-stone-500">/</Text>
                    <Text
                      className={`text-center text-xl font-bold ${
                        isModified ? 'text-amber-400' : 'text-stone-100'
                      }`}>
                      {assignment.totalPoints}
                    </Text>
                  </>
                ) : null}
              </View>
            </TouchableOpacity>
            {percentDisplay !== null && (
              <Text className={`text-base ${getScoreColor()}`}>{percentDisplay}%</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#78716c" />
        </View>
      </View>
    </Pressable>
  );
}

export const GradeCard = memo(GradeCardComponent);
