import { View, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAllAssignments, useGrades } from '@/hooks/use-ic';
import { AssignmentCard } from '@/components/AssignmentCard';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { HeaderButton } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { AndroidSheetHeader } from '@/components/AndroidSheetHeader';
import { useBottomContentPadding } from '@/utils/screen-spacing';
import { QueryErrorState } from '@/components/QueryErrorState';
import { pickSchoolError } from '@/utils/school-error';

export default function DayModal() {
  const router = useRouter();
  const contentBottomPadding = useBottomContentPadding(24);
  const { date } = useLocalSearchParams<{ date: string }>();
  const {
    data: loadedAssignments,
    error: assignmentsError,
    refetch: refetchAssignments,
  } = useAllAssignments();
  const { data: loadedGrades, error: gradesError, refetch: refetchGrades } = useGrades();
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

  const selectedDayjs = date ? dayjs(date) : null;
  const currentDate = useMemo(() => dayjs(), []);

  const selectedAssignments = useMemo(() => {
    if (!assignments || !date) return [];
    const dateKey = dayjs(date).startOf('day').format('YYYY-MM-DD');
    return assignments.filter((assignment) => {
      const assignmentDateKey = dayjs(assignment.dueDate).startOf('day').format('YYYY-MM-DD');
      return assignmentDateKey === dateKey;
    });
  }, [assignments, date]);

  useEffect(() => {
    if (!date || !selectedDayjs) {
      router.back();
    }
  }, [date, router, selectedDayjs]);

  if (!date || !selectedDayjs) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: selectedDayjs.format('dddd, MMMM D'),
          headerStyle: { backgroundColor: '#171717' },
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff', fontSize: 18, fontWeight: '600' },
        }}
      />
      <View className="flex-1 bg-neutral-900">
        {error ? (
          <QueryErrorState
            error={error}
            subject="assignments"
            onRetry={retry}
            retrying={retrying}
          />
        ) : (
          <ScrollView
            className="flex-1 px-4"
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: contentBottomPadding }}>
            <View className="mb-10">
              {selectedAssignments.map((assignment) => (
                <AssignmentCard
                  key={`${assignment.objectSectionID}-${assignment.assignmentName}`}
                  assignment={assignment}
                  courseName={courseNameMap.get(assignment.sectionID) ?? assignment.courseName}
                  now={currentDate}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </>
  );
}
