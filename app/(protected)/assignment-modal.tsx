import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { HeaderButton } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { useAssignment } from '@/hooks/use-ic';
import { useEffect } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { releaseAssignmentModalNavigationLock } from '@/utils/assignment-modal-navigation';
import { AndroidSheetHeader } from '@/components/AndroidSheetHeader';
import { useBottomContentPadding } from '@/utils/screen-spacing';
import { isNonPointsScoringType } from '@/api/src/assignment-score';
import { QueryErrorState } from '@/components/QueryErrorState';

dayjs.extend(relativeTime);

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDueText(daysUntil: number): { text: string; color: string } {
  if (daysUntil < 0) {
    const daysPast = Math.abs(daysUntil);
    return { text: `${daysPast} day${daysPast === 1 ? '' : 's'} ago`, color: 'text-red-400' };
  }
  if (daysUntil === 0) {
    return { text: 'today', color: 'text-yellow-400' };
  }
  if (daysUntil === 1) {
    return { text: 'tomorrow', color: 'text-green-500' };
  }
  return { text: `in ${daysUntil} days`, color: 'text-green-500' };
}

export default function AssignmentModal() {
  const router = useRouter();
  const contentBottomPadding = useBottomContentPadding(24);
  const { objectSectionID, assignmentName } = useLocalSearchParams<{
    objectSectionID: string;
    assignmentName?: string;
  }>();

  const {
    data: loadedAssignment,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useAssignment(objectSectionID ? parseInt(objectSectionID, 10) : 0);
  // Assignment detail comes only from the latest successful request.
  const assignment = error ? undefined : loadedAssignment;

  useEffect(() => {
    releaseAssignmentModalNavigationLock();

    return () => {
      releaseAssignmentModalNavigationLock();
    };
  }, []);

  useEffect(() => {
    if (!objectSectionID) {
      router.back();
    }
  }, [objectSectionID, router]);

  if (!objectSectionID) {
    return null;
  }

  const startDate = assignment?.startDate ? dayjs(assignment.startDate) : null;
  const endDate = assignment?.endDate ? dayjs(assignment.endDate) : null;
  const description = assignment?.curriculumContent?.description;
  const scoreData = assignment?.scores?.[0];
  const gradingAlignment = assignment?.gradingAlignments?.[0];
  const totalPoints = gradingAlignment?.totalPoints;
  const multiplier = gradingAlignment?.weight ?? 1;
  const isNonPointsScore = isNonPointsScoringType(gradingAlignment?.scoringType);

  const daysUntil = endDate ? endDate.startOf('day').diff(dayjs().startOf('day'), 'day') : null;
  const dueInfo = daysUntil !== null ? formatDueText(daysUntil) : null;

  const scoreValue = isNonPointsScore
    ? (scoreData?.score ?? scoreData?.scorePoints)
    : (scoreData?.scorePoints ?? scoreData?.score);
  const scoreComment =
    typeof scoreData?.comments === 'string' ? stripHtml(scoreData.comments) : null;
  const scorePercentage = scoreData?.scorePercentage
    ? parseFloat(scoreData.scorePercentage).toFixed(2)
    : null;
  const hasScore = scoreValue != null && scoreValue !== '';
  const hasScoreComment = Boolean(scoreComment);
  const hasTotalPoints = totalPoints != null;
  const hasPercent = scorePercentage != null && (isNonPointsScore || (totalPoints ?? 0) > 0);
  const hasMultiplier = multiplier != null && multiplier !== 1;

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: assignmentName || 'Assignment',
          headerStyle: { backgroundColor: '#171717' },
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff', fontSize: 18, fontWeight: '600' },
          headerRight: ({ tintColor }) => (
            <HeaderButton accessibilityLabel="Close" onPress={() => router.back()}>
              <View className="h-11 w-11 items-center justify-center">
                <Ionicons name="close" size={27} color={tintColor ?? '#ffffff'} />
              </View>
            </HeaderButton>
          ),
        }}
      />
      <View className="flex-1 bg-neutral-900">
        {Platform.OS === 'android' && (
          <AndroidSheetHeader
            title={assignmentName || 'Assignment'}
            onClose={() => router.back()}
          />
        )}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : error ? (
          <QueryErrorState
            error={error}
            subject="assignment details"
            onRetry={async () => {
              await refetch();
            }}
            retrying={isFetching}
          />
        ) : (
          <ScrollView
            className="flex-1 px-4"
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{
              paddingTop: 16,
              paddingBottom: contentBottomPadding,
            }}>
            {scoreData && (
              <View className=" mb-4 rounded-2xl border border-stone-700 p-5">
                <Text className="mb-2 text-lg font-semibold text-stone-500">Grade</Text>
                <View className="flex-row items-baseline">
                  {hasScore && hasTotalPoints && !isNonPointsScore ? (
                    <>
                      <Text className="text-4xl font-bold text-white">
                        {scoreValue}/{totalPoints}
                      </Text>
                      {hasPercent && (
                        <Text className="ml-3 text-xl font-semibold text-green-500">
                          ({scorePercentage}%)
                        </Text>
                      )}
                    </>
                  ) : hasScore ? (
                    <>
                      <Text className="text-4xl font-bold text-white">{scoreValue}</Text>
                      {hasPercent && (
                        <Text className="ml-3 text-xl font-semibold text-green-500">
                          ({scorePercentage}%)
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text className="text-2xl font-bold text-stone-400">Not graded</Text>
                  )}
                </View>
                {hasMultiplier && (
                  <Text className="mt-3 text-base text-stone-400">
                    Multiplier: {formatNumber(multiplier)}
                  </Text>
                )}
                {hasScoreComment && (
                  <View className="mt-3 gap-2">
                    <Text className="text-sm leading-relaxed text-stone-300">
                      💬 {scoreComment}
                    </Text>
                    {hasMultiplier && (
                      <Text className="text-base text-stone-400">
                        Multiplier: {formatNumber(multiplier)}
                      </Text>
                    )}
                  </View>
                )}
                {assignment?.modifiedDate && (
                  <Text className="mt-3 text-sm text-stone-500">
                    Updated {dayjs(assignment.modifiedDate).fromNow()} at{' '}
                    {dayjs(assignment.modifiedDate).format('h:mm A')}
                  </Text>
                )}
              </View>
            )}

            <View className="mb-4 rounded-2xl border border-stone-700 p-5">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-stone-500">Due</Text>
                {dueInfo && (
                  <Text className={`${dueInfo.color} text-lg font-semibold`}>{dueInfo.text}</Text>
                )}
              </View>
              <Text className="text-2xl font-bold text-white">
                {endDate ? endDate.format('dddd, MMM D') : '—'}
              </Text>
              <Text className="mt-1 text-base text-stone-400">
                at {endDate ? endDate.format('h:mm A') : '—'}
              </Text>
              <Text className="mt-3 text-sm text-stone-500">
                Assigned {startDate ? startDate.format('MMM D, h:mm A') : '—'}
              </Text>
            </View>

            {description?.content && (
              <View className="rounded-2xl border border-stone-700 p-5">
                <Text className="mb-2 text-lg font-semibold text-stone-500">Description</Text>
                <Text className="text-base leading-relaxed text-white">
                  {stripHtml(description.content)}
                </Text>
              </View>
            )}

            {!scoreData && !description?.content && (
              <View className="mb-4 rounded-2xl border border-stone-700 bg-stone-800/50 p-5">
                <Text className="text-center text-stone-500">No additional details available</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}
