import { memo, useCallback, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ExtractedCourse } from '@/api/src/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { playHaptic } from '@/utils/haptics';
import { openCourseModal } from '@/utils/assignment-modal-navigation';
import { usePreferences } from '@/hooks/use-preferences';

type CourseCardProps = {
  course: ExtractedCourse;
  lastUpdated?: string | null;
  recentImpact?: number;
};

const formatRelativeDate = (dateString: string | null | undefined) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  let relativeStr = '';
  if (diffDays > 0) {
    relativeStr = diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  } else if (diffHours > 0) {
    relativeStr = diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffMinutes > 0) {
    relativeStr = diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  } else {
    relativeStr = 'just now';
  }

  return `${relativeStr} at ${timeStr}`;
};

function CourseCardComponent({ course, lastUpdated, recentImpact }: CourseCardProps) {
  const router = useRouter();
  const { showCoursePercentImpact } = usePreferences();
  const hasCourseDetail = course.hasDetail || course.hasAssignments;

  const handlePress = useCallback(() => {
    if (!hasCourseDetail) return;

    playHaptic('navigation');
    openCourseModal(router, {
      sectionID: course.sectionID.toString(),
      courseName: course.courseName,
      teacher: course.teacher,
      score: course.score ?? '',
      percent: course.percent?.toString() ?? '',
      termName: course.termName,
      taskName: course.taskName,
    });
  }, [course, hasCourseDetail, router]);
  /*
  const getScoreColor = () => {
    if (!course.percent) return 'text-stone-400'
    //if (course.percent >= 90) return 'text-green-400'
    if (course.percent >= 80) return 'text-green-400'
    if (course.percent >= 70) return 'text-yellow-400'
    if (course.percent >= 60) return 'text-orange-400'
    return 'text-red-400'
  }*/

  const getImpactColor = () => {
    if (recentImpact === undefined || recentImpact === 0) return 'text-stone-500';
    if (recentImpact > 0) return 'text-green-400';
    return 'text-red-400';
  };

  const formatImpact = () => {
    if (recentImpact === undefined) return null;
    if (recentImpact === 0) return '0%';
    const rounded = Math.round(recentImpact * 100) / 100;
    return recentImpact > 0 ? `+${rounded}%` : `${rounded}%`;
  };

  const dateDisplay = useMemo(() => formatRelativeDate(lastUpdated), [lastUpdated]);
  const percentLabel = course.percent !== undefined ? `${course.percent}%` : null;
  const gradeColorClassName =
    showCoursePercentImpact || !percentLabel ? 'text-stone-100' : 'text-green-400';
  const gradeClassName = showCoursePercentImpact
    ? `text-2xl font-bold leading-tight ${gradeColorClassName}`
    : `text-center text-2xl font-bold leading-tight ${gradeColorClassName}`;
  const gradeContainerClassName = showCoursePercentImpact
    ? 'flex-col items-end justify-center self-center'
    : 'flex-col items-center justify-center self-center';
  const shouldShowImpact = formatImpact() !== null;

  return (
    <Pressable
      disabled={!hasCourseDetail}
      onPress={handlePress}
      className={`mb-4 rounded-2xl border border-stone-700 p-5 ${
        hasCourseDetail ? 'active:scale-[0.97] active:opacity-80' : 'opacity-80'
      }`}>
      <View className="flex-row items-center justify-between">
        <View className="mr-4 flex-1">
          <Text
            className="mb-2 text-2xl font-semibold leading-snug text-stone-100"
            numberOfLines={2}>
            {course.courseName}
          </Text>
          {dateDisplay ? (
            <View className="flex-row items-center">
              {dateDisplay.includes('hour') || dateDisplay.includes('minute') ? (
                <Text className="text-base font-medium">
                  <Text className="text-green-400">{dateDisplay.split(' at ')[0]}</Text>
                  <Text className="text-stone-500">{' at ' + dateDisplay.split(' at ')[1]}</Text>
                </Text>
              ) : (
                <Text className="text-base text-stone-500">{dateDisplay}</Text>
              )}
            </View>
          ) : (
            <Text className="mt-1 text-base text-stone-500">
              {course.termName}
              {!hasCourseDetail ? (
                <Text className="text-base text-stone-500"> - No assignments</Text>
              ) : null}
            </Text>
          )}
        </View>
        <View className={gradeContainerClassName}>
          {showCoursePercentImpact ? (
            <>
              <Text className={gradeClassName}>
                {course.score ?? '-'}
                {percentLabel ? ` (${percentLabel})` : ''}
              </Text>
              {shouldShowImpact ? (
                <Text>
                  {getImpactColor() === 'text-green-400' ? (
                    <Text className={getImpactColor()}>
                      <Ionicons name="caret-up-outline" className={getImpactColor()} />
                    </Text>
                  ) : getImpactColor() === 'text-red-400' ? (
                    <Text className={getImpactColor()}>
                      <Ionicons name="caret-down-outline" className={getImpactColor()} />
                    </Text>
                  ) : null}
                  <Text className={`${getImpactColor()} text-base`}>({formatImpact()}) </Text>
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text className={gradeClassName}>{course.score ?? '-'}</Text>
              {percentLabel ? <Text className={gradeClassName}>({percentLabel})</Text> : null}
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export const CourseCard = memo(CourseCardComponent);
