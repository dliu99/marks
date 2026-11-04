import { OfflineStatus } from '@/components/OfflineStatus';
import { View, Text, SectionList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAllAssignments, useGrades } from '@/hooks/use-ic';
import { AssignmentCard } from '@/components/AssignmentCard';
import { Assignment } from '@/api/src/types';
import { QueryErrorState } from '@/components/QueryErrorState';
import { useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { useSearch } from './_context';
import { useBottomContentPadding } from '@/utils/screen-spacing';

function getAllUpcomingAssignments(assignments: Assignment[], today: dayjs.Dayjs): Assignment[] {
  const todayStart = today.startOf('day');
  return assignments
    .filter((a) => {
      const dueDate = dayjs(a.dueDate);
      return (
        dueDate.isValid() &&
        (dueDate.startOf('day').isSame(todayStart) || dueDate.isAfter(todayStart))
      );
    })
    .sort((a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf());
}

export default function Search() {
  const { query } = useSearch();
  const contentBottomPadding = useBottomContentPadding(24, { includesNativeTabBar: true });
  const {
    data: assignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
    refetch: refetchAssignments,
  } = useAllAssignments();
  const {
    data: grades,
    isLoading: gradesLoading,
    error: gradesError,
    refetch: refetchGrades,
  } = useGrades();

  const courseNameMap = useMemo(() => {
    const map = new Map<number, string>();
    if (grades) {
      for (const course of grades) {
        map.set(course.sectionID, course.courseName);
      }
    }
    return map;
  }, [grades]);

  const today = useMemo(() => dayjs(), []);

  const upcomingAssignments = useMemo(() => {
    if (!assignments) return [];
    return getAllUpcomingAssignments(assignments, today);
  }, [assignments, today]);

  const filteredAssignments = useMemo(() => {
    if (!query.trim()) return upcomingAssignments;
    const lowerQuery = query.toLowerCase();
    return upcomingAssignments.filter((a) => {
      const nameMatch = a.assignmentName?.toLowerCase().includes(lowerQuery);
      const courseName = courseNameMap.get(a.sectionID) ?? a.courseName;
      const courseMatch = courseName?.toLowerCase().includes(lowerQuery);
      return nameMatch || courseMatch;
    });
  }, [upcomingAssignments, query, courseNameMap]);

  const sections = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of filteredAssignments) {
      const dateKey = dayjs(a.dueDate).startOf('day').format('YYYY-MM-DD');
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(a);
    }

    return Array.from(map.entries()).map(([dateKey, data]) => ({
      title: dayjs(dateKey).format('dddd, MMMM D'),
      data,
    }));
  }, [filteredAssignments]);
  const renderItem = useCallback(
    ({ item }: { item: Assignment }) => (
      <AssignmentCard
        assignment={item}
        courseName={courseNameMap.get(item.sectionID) ?? item.courseName}
        now={today}
      />
    ),
    [courseNameMap, today]
  );

  const isLoading = assignmentsLoading || gradesLoading;
  const hasError = !!((assignmentsError && !assignments) || (gradesError && !grades));

  const retry = async () => {
    await Promise.all([refetchAssignments(), refetchGrades()]);
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-900">
        <ActivityIndicator size="large" color="#fff" />
      </SafeAreaView>
    );
  }

  if (hasError) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-900" edges={[]} collapsable={false}>
        <QueryErrorState
          title="Unable to load assignments"
          message="Search data did not load. Try again."
          onRetry={retry}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={[]} collapsable={false}>
      <SectionList
        ListHeaderComponent={<OfflineStatus />}
        className="flex-1"
        sections={sections}
        keyExtractor={(assignment) => `${assignment.objectSectionID}-${assignment.assignmentName}`}
        renderItem={renderItem}
        renderSectionHeader={({ section: { title } }) => (
          <Text className="mb-2 mt-2 text-xl font-semibold text-stone-500">{title}</Text>
        )}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingBottom: contentBottomPadding,
          paddingHorizontal: 20,
        }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center pt-20">
            <Text className="text-xl font-medium text-white">
              {query.trim() ? 'No matching assignments' : 'No upcoming assignments'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
