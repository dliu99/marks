import { View, Text, SectionList, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAllAssignments, useGrades } from '@/hooks/use-ic';
import { AssignmentCard } from '@/components/AssignmentCard';
import { Assignment } from '@/api/src/types';
import { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { playHaptic } from '@/utils/haptics';
import { QueryErrorState } from '@/components/QueryErrorState';
import { pickSchoolError } from '@/utils/school-error';

function getBeyondAssignments(assignments: Assignment[], today: dayjs.Dayjs): Assignment[] {
  const todayStart = today.startOf('day');
  const twoWeeksFromNow = todayStart.add(14, 'day');

  return assignments
    .filter((a) => {
      const dueDate = dayjs(a.dueDate);
      return (
        dueDate.isValid() &&
        (dueDate.startOf('day').isSame(twoWeeksFromNow) || dueDate.isAfter(twoWeeksFromNow))
      );
    })
    .sort((a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf());
}

export default function SeeAll() {
  const router = useRouter();
  const {
    data: loadedAssignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
    refetch: refetchAssignments,
  } = useAllAssignments();
  const {
    data: loadedGrades,
    isLoading: gradesLoading,
    error: gradesError,
    refetch: refetchGrades,
  } = useGrades();
  const error = pickSchoolError(assignmentsError, gradesError);
  const assignments = error ? undefined : loadedAssignments;
  const grades = error ? undefined : loadedGrades;
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all([refetchAssignments(), refetchGrades()]);
    } finally {
      setRetrying(false);
    }
  };

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

  const beyondAssignments = useMemo(() => {
    if (!assignments) return [];
    return getBeyondAssignments(assignments, today);
  }, [assignments, today]);

  const sections = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of beyondAssignments) {
      const dateKey = dayjs(a.dueDate).startOf('day').format('YYYY-MM-DD');
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(a);
    }

    return Array.from(map.entries()).map(([dateKey, data]) => ({
      title: dayjs(dateKey).format('dddd, MMMM D'),
      data,
    }));
  }, [beyondAssignments]);
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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-900">
        <ActivityIndicator size="large" color="#fff" />
      </SafeAreaView>
    );
  }

  const glassAvailable = isLiquidGlassAvailable();

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']}>
      <Pressable
        onPress={() => {
          playHaptic('navigation');
          router.back();
        }}
        className="absolute bottom-8 left-6 z-10">
        {glassAvailable ? (
          <GlassView
            isInteractive
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </GlassView>
        ) : (
          <View
            className="items-center justify-center rounded-full bg-stone-800"
            style={{ width: 56, height: 56 }}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </View>
        )}
      </Pressable>
      {error ? (
        <QueryErrorState error={error} subject="assignments" onRetry={retry} retrying={retrying} />
      ) : (
        <SectionList
          className="flex-1"
          sections={sections}
          keyExtractor={(assignment) =>
            `${assignment.objectSectionID}-${assignment.assignmentName}`
          }
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <Text className="mb-2 mt-5 text-xl font-semibold text-stone-500">{title}</Text>
          )}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 }}
          ListHeaderComponent={
            beyondAssignments.length > 0 ? (
              <Text className="text-3xl font-bold text-white">All Upcoming</Text>
            ) : null
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-20">
              <Text className="text-xl font-medium text-white">No assignments beyond 2 weeks</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
