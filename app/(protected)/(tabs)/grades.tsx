import { OfflineStatus } from '@/components/OfflineStatus';
import { Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAllGradesWithDetails } from '@/hooks/use-ic';
import { CourseCard } from '@/components/CourseCard';
import { AssignmentSubjects } from '@/components/AssignmentSubjects';
import { QueryErrorState } from '@/components/QueryErrorState';
import { CourseGradeDetailResponse, ExtractedCourse } from '@/api/src/types';
import { usePreferences } from '@/hooks/use-preferences';
import { useCallback, useMemo, useState } from 'react';
import {
  calculatePercentImpactFromRaw,
  getCourseGradeBaseline,
  getCourseGradePercent,
  isCountedGradeAssignment,
} from '@/utils/grade-calculator';
import { sortCoursesByPreference } from '@/utils/course-order';
import { useBottomContentPadding } from '@/utils/screen-spacing';

function computeCourseStats(courseData: CourseGradeDetailResponse | undefined) {
  if (!courseData?.categories) return { lastUpdated: null, recentImpact: undefined };

  const isWeighted = courseData.task.groupWeighted;
  const baselinePercent = getCourseGradePercent(courseData.task);
  const gradeBaseline = getCourseGradeBaseline(courseData.task);

  let mostRecent: { date: string; impact: number } | null = null;

  for (const category of courseData.categories) {
    for (const assignment of category.assignments) {
      if (assignment.scoreModifiedDate && isCountedGradeAssignment(assignment)) {
        const percentImpact = calculatePercentImpactFromRaw(
          assignment,
          courseData.categories,
          isWeighted,
          baselinePercent,
          gradeBaseline
        );

        if (!mostRecent || new Date(assignment.scoreModifiedDate) > new Date(mostRecent.date)) {
          mostRecent = {
            date: assignment.scoreModifiedDate,
            impact: Math.round(percentImpact * -100) / 100,
          };
        }
      }
    }
  }

  return {
    lastUpdated: mostRecent?.date ?? null,
    recentImpact: mostRecent?.impact,
  };
}

function CourseCardWithDetails({
  course,
  courseData,
  showCoursePercentImpact,
}: {
  course: ExtractedCourse;
  courseData: CourseGradeDetailResponse | undefined;
  showCoursePercentImpact: boolean;
}) {
  const { lastUpdated, recentImpact } = useMemo(() => computeCourseStats(courseData), [courseData]);

  return (
    <CourseCard
      course={course}
      lastUpdated={lastUpdated}
      recentImpact={showCoursePercentImpact ? recentImpact : undefined}
    />
  );
}

export default function Grades() {
  const [refreshing, setRefreshing] = useState(false);
  const contentBottomPadding = useBottomContentPadding(24, { includesNativeTabBar: true });
  const { data, isLoading, error, refetch } = useAllGradesWithDetails();
  const { showCoursePercentImpact, courseOrder, hiddenCourseIds } = usePreferences();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const courses = useMemo(
    () =>
      data?.courses
        ? sortCoursesByPreference(data.courses, courseOrder).filter(
            (course) => !hiddenCourseIds.includes(course.sectionID)
          )
        : undefined,
    [courseOrder, data?.courses, hiddenCourseIds]
  );
  const detailsMap = data?.detailsMap;
  const renderItem = useCallback(
    ({ item }: { item: ExtractedCourse }) => (
      <CourseCardWithDetails
        course={item}
        courseData={detailsMap?.get(item.sectionID)}
        showCoursePercentImpact={showCoursePercentImpact}
      />
    ),
    [detailsMap, showCoursePercentImpact]
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-900">
        <Text className="mb-6 text-center text-stone-400">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']} collapsable={false}>
        <QueryErrorState
          title="Unable to load grades"
          message="Grade data is unavailable right now. Try again."
          onRetry={onRefresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']} collapsable={false}>
      <FlatList
        data={courses ?? []}
        keyExtractor={(course) => `${course.sectionID}-${course.termName}`}
        renderItem={renderItem}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: 48,
          paddingBottom: contentBottomPadding,
          paddingHorizontal: 16,
        }}
        ListHeaderComponent={
          !isLoading ? (
            <>
              <Text className="mb-4 text-3xl font-bold text-white">Grades</Text>
              <OfflineStatus />
            </>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <Text className="mb-6 text-center text-stone-400">Loading...</Text>
          ) : (
            <>
              <Text className="mb-6 mt-8 text-center text-stone-400">
                {data?.availability.gradesEnabled === false
                  ? "Your school hasn't enabled grade information in Infinite Campus."
                  : data?.fallbackAssignments.length
                    ? 'Overall grades are unavailable. You can still view your assignments below.'
                    : 'No courses found'}
              </Text>
              {data?.fallbackAssignmentsError && (
                <Text className="mb-4 text-center text-stone-400">
                  Assignments could not load. Pull down to try again.
                </Text>
              )}
              {!!data?.fallbackAssignments.length && (
                <AssignmentSubjects assignments={data.fallbackAssignments} />
              )}
            </>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="white"
            title="Refreshing..."
            titleColor="white"
            progressBackgroundColor="white"
          />
        }
      />
    </SafeAreaView>
  );
}
