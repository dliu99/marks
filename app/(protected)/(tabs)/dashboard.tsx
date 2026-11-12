import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useAllAssignments, useGrades, useUser } from '@/hooks/use-ic';
import { useAnnouncement } from '@/hooks/use-announcement';
import { AssignmentCard } from '@/components/AssignmentCard';
import { AssignmentHeatmap } from '@/components/AssignmentHeatmap';
import { QueryErrorState } from '@/components/QueryErrorState';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { Assignment } from '@/api/src/types';
import { useMemo, useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { playHaptic } from '@/utils/haptics';
import { useBottomContentPadding } from '@/utils/screen-spacing';
import { pickSchoolError } from '@/utils/school-error';

const GREETINGS = {
  morning: ['Good morning, {name}.', 'Rise and shine, {name}.'],
  afternoon: ['Good afternoon, {name}.'],
  evening: ['Good evening, {name}.'],
  night: [
    'Still up, {name}?',
    'Good evening, {name}.',
    'Working late, {name}?',
    'Late night, {name}?',
  ],
};

function getTimeOfDay(hour: number): keyof typeof GREETINGS {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const timeOfDay = getTimeOfDay(hour);
  const greetings = GREETINGS[timeOfDay];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  return name ? greeting.replace('{name}', name) : greeting.replace(/,? \{name\}/, '');
}

type GroupedAssignments = {
  today: Assignment[];
  upcoming: Assignment[];
  beyond: Assignment[];
};

function formatDateHeader(
  date: dayjs.Dayjs,
  today: dayjs.Dayjs
): { title: string; subtitle: string } {
  const days = date.startOf('day').diff(today.startOf('day'), 'day');
  const dayName = date.format('dddd');
  const monthDay = date.format('MMMM D');

  if (days === 0) {
    return { title: 'Today', subtitle: `${dayName}, ${monthDay}` };
  }

  const subtitle = `${dayName}, ${monthDay}`;

  return { title: 'Upcoming', subtitle };
}

function groupAssignments(assignments: Assignment[], today: dayjs.Dayjs): GroupedAssignments {
  const todayStart = today.startOf('day');
  const twoWeeksFromNow = todayStart.add(14, 'day');

  const filtered = assignments.filter((a) => {
    const dueDate = dayjs(a.dueDate);
    const isValid = dueDate.isValid();
    const isFuture = dueDate.startOf('day').isSame(todayStart) || dueDate.isAfter(todayStart);
    return isValid && isFuture;
  });

  const sorted = filtered.sort((a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf());

  const grouped: GroupedAssignments = { today: [], upcoming: [], beyond: [] };

  for (const assignment of sorted) {
    const dueDate = dayjs(assignment.dueDate).startOf('day');
    const days = dueDate.diff(todayStart, 'day');

    if (days === 0) {
      grouped.today.push(assignment);
    } else if (dueDate.isBefore(twoWeeksFromNow)) {
      grouped.upcoming.push(assignment);
    } else {
      grouped.beyond.push(assignment);
    }
  }

  return grouped;
}

function AssignmentSection({
  assignments,
  today,
  courseNameMap,
  sectionTitle,
}: {
  assignments: Assignment[];
  today: dayjs.Dayjs;
  courseNameMap: Map<number, string>;
  sectionTitle?: string;
}) {
  if (assignments.length === 0) return null;

  const byDate = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const dateKey = dayjs(a.dueDate).startOf('day').format('YYYY-MM-DD');
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(a);
  }

  const showSectionTitle = sectionTitle !== undefined;

  return (
    <View className="">
      {showSectionTitle && <Text className="text-2xl font-bold text-white">{sectionTitle}</Text>}

      {Array.from(byDate.entries()).map(([dateKey, dateAssignments]) => {
        const date = dayjs(dateKey);
        const { title, subtitle } = formatDateHeader(date, today);
        return (
          <View key={dateKey} className="mb-1">
            {!showSectionTitle && <Text className="text-3xl font-bold text-white">{title}</Text>}
            <Text className="mb-3 mt-1 text-xl font-semibold text-stone-500">{subtitle}</Text>
            {dateAssignments.map((assignment) => (
              <AssignmentCard
                key={`${assignment.objectSectionID}-${assignment.assignmentName}`}
                assignment={assignment}
                courseName={courseNameMap.get(assignment.sectionID) ?? assignment.courseName}
                now={today}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

export default function Dashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
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
  const { data: user, error: userError, refetch: refetchUser } = useUser();
  const { data: announcement, dismissAnnouncement } = useAnnouncement();

  const onRefresh = async () => {
    setRefreshing(true);
    setToday(dayjs());
    try {
      await Promise.all([refetchAssignments(), refetchGrades(), refetchUser()]);
    } finally {
      setRefreshing(false);
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

  const [today, setToday] = useState(() => dayjs());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        setToday(dayjs());
      }
    });
    return () => subscription.remove();
  }, []);

  const grouped = useMemo(() => {
    if (!assignments) return { today: [], upcoming: [], beyond: [] };
    return groupAssignments(assignments, today);
  }, [assignments, today]);

  const weekStats = useMemo(() => {
    if (!assignments) return { total: 0, busiestCourse: '' };

    const dayOfWeek = today.day();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    const weekEnd = today.add(daysUntilFriday, 'day').endOf('day');

    const weekAssignments = assignments.filter((a) => {
      const dueDate = dayjs(a.dueDate);
      return (
        dueDate.isValid() && dueDate.isBefore(weekEnd) && dueDate.isAfter(today.subtract(1, 'day'))
      );
    });

    const courseCounts = new Map<string, number>();
    for (const assignment of weekAssignments) {
      const courseName =
        courseNameMap.get(assignment.sectionID) ?? assignment.courseName ?? 'Unknown Course';
      courseCounts.set(courseName, (courseCounts.get(courseName) || 0) + 1);
    }

    let busiestCourse = '';
    let maxCount = 0;
    for (const [course, count] of courseCounts) {
      if (count > maxCount) {
        maxCount = count;
        busiestCourse = course;
      }
    }

    return { total: weekAssignments.length, busiestCourse };
  }, [assignments, today, courseNameMap]);

  const isLoading = assignmentsLoading || gradesLoading;
  const error = pickSchoolError(gradesError, assignmentsError, userError);

  const retry = async () => {
    await onRefresh();
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-900">
        <ActivityIndicator size="large" color="#fff" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']} collapsable={false}>
        <QueryErrorState
          error={error}
          subject="assignments and grades"
          onRetry={retry}
          retrying={refreshing}
        />
      </SafeAreaView>
    );
  }

  const hasAssignments = grouped.today.length > 0 || grouped.upcoming.length > 0;
  const contentTopPadding = announcement ? insets.top + 88 : 48;

  return (
    <View className="flex-1 bg-neutral-900" collapsable={false}>
      {announcement ? (
        <AnnouncementBanner announcement={announcement} onDismiss={dismissAnnouncement} />
      ) : null}
      <SafeAreaView className="flex-1 bg-neutral-900" edges={announcement ? [] : ['top']}>
        <ScrollView
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingTop: contentTopPadding,
            paddingBottom: contentBottomPadding,
            paddingHorizontal: 16,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="white"
              title="Refreshing..."
              titleColor="white"
              progressBackgroundColor="white"
            />
          }>
          <View className="pb-4">
            <Text className="text-3xl font-bold text-white">
              {getGreeting(user?.firstName ?? '')}
            </Text>
            <Text className="mt-2 text-lg font-semibold text-stone-500">
              {weekStats.total > 0 ? (
                <Text>
                  You have {weekStats.total} assignment(s) left this week, with your busiest class
                  being{' '}
                  <Text className="text-green-500">{weekStats.busiestCourse.replace('.', '')}</Text>
                  .
                </Text>
              ) : (
                'You have no assignments this week!'
              )}
            </Text>
          </View>
          <AssignmentHeatmap
            assignments={assignments ?? []}
            courseNameMap={courseNameMap}
            currentDate={today}
          />
          {!hasAssignments ? (
            <View className="flex-1 items-center justify-center pt-20">
              <Text className="text-xl font-medium text-white">You have no assignments! 🎉</Text>
            </View>
          ) : (
            <>
              <AssignmentSection
                assignments={grouped.today}
                today={today}
                courseNameMap={courseNameMap}
              />
              <AssignmentSection
                assignments={grouped.upcoming}
                today={today}
                courseNameMap={courseNameMap}
                sectionTitle="Upcoming"
              />
              {grouped.beyond.length > 0 && (
                <Link href="/(protected)/(tabs)/search" asChild>
                  <TouchableOpacity
                    onPress={() => playHaptic('navigation')}
                    className="mb-6 flex-row items-center justify-between rounded-2xl border border-stone-700 p-5 px-6  py-5 active:scale-[0.97] active:opacity-80">
                    <Text className="text-base font-medium text-white">
                      Search all assignments ({grouped.beyond.length} more)
                    </Text>
                    <Text className="text-xl text-stone-400">→</Text>
                  </TouchableOpacity>
                </Link>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
