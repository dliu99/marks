import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';
import type { SortableGridRenderItem } from 'react-native-sortables';
import { QueryErrorState } from '@/components/QueryErrorState';
import { useAllGrades } from '@/hooks/use-ic';
import { usePreferences } from '@/hooks/use-preferences';
import { sortCoursesByPreference } from '@/utils/course-order';
import { playHaptic } from '@/utils/haptics';
import { setCourseOrder, setHiddenCourseIds } from '@/utils/storage';
import type { ExtractedCourse } from '@/api/src/types';
import {
  useBottomContentPadding,
  useTransparentHeaderContentPadding,
} from '@/utils/screen-spacing';

function CourseItem({
  course,
  hidden,
  onToggleHidden,
}: {
  course: ExtractedCourse;
  hidden: boolean;
  onToggleHidden: (sectionID: number) => void;
}) {
  return (
    <View
      className={`rounded-2xl border border-stone-700 bg-stone-900 px-5 py-4 ${hidden ? 'opacity-45' : ''}`}>
      <View className="flex-row items-center gap-4">
        <Sortable.Handle>
          <View className="rounded-full p-1">
            <Ionicons name="reorder-three-outline" size={26} color="#a8a29e" />
          </View>
        </Sortable.Handle>
        <Text className="flex-1 text-2xl font-semibold text-white" numberOfLines={2}>
          {course.courseName}
        </Text>
        <Pressable
          hitSlop={10}
          onPress={() => {
            playHaptic('selection');
            onToggleHidden(course.sectionID);
          }}
          className="active:opacity-70">
          <Ionicons
            name={hidden ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color={hidden ? '#78716c' : '#d6d3d1'}
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function ReorderCourses() {
  const { data, isLoading, error, refetch } = useAllGrades();
  const { courseOrder, hiddenCourseIds } = usePreferences();
  const contentTopPadding = useTransparentHeaderContentPadding(24);
  const contentBottomPadding = useBottomContentPadding(32, { includesNativeTabBar: true });

  const courses = useMemo(
    () => (data ? sortCoursesByPreference(data, courseOrder) : []),
    [courseOrder, data]
  );

  const handleToggleHidden = useCallback(
    (sectionID: number) => {
      if (hiddenCourseIds.includes(sectionID)) {
        setHiddenCourseIds(hiddenCourseIds.filter((id) => id !== sectionID));
        return;
      }

      setHiddenCourseIds([...hiddenCourseIds, sectionID]);
    },
    [hiddenCourseIds]
  );

  const renderItem = useCallback<SortableGridRenderItem<ExtractedCourse>>(
    ({ item }) => (
      <CourseItem
        course={item}
        hidden={hiddenCourseIds.includes(item.sectionID)}
        onToggleHidden={handleToggleHidden}
      />
    ),
    [handleToggleHidden, hiddenCourseIds]
  );

  const handleDragEnd = useCallback((nextCourses: ExtractedCourse[]) => {
    setCourseOrder(nextCourses.map((course) => course.sectionID));
    playHaptic('navigation');
  }, []);

  const handleReset = useCallback(() => {
    setCourseOrder([]);
    setHiddenCourseIds([]);
    playHaptic('selection');
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-900">
        <Text className="text-stone-400">Loading courses...</Text>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']} collapsable={false}>
        <QueryErrorState
          title="Unable to load courses"
          message="Your courses are unavailable right now. Try again."
          onRetry={async () => {
            await refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{
          paddingTop: contentTopPadding,
          paddingBottom: contentBottomPadding,
        }}
        showsVerticalScrollIndicator={false}>
        <Sortable.Grid
          columns={1}
          customHandle
          data={courses}
          keyExtractor={(course) => course.sectionID.toString()}
          renderItem={renderItem}
          rowGap={12}
          dragActivationDelay={0}
          onDragEnd={({ data: nextCourses }) => {
            handleDragEnd(nextCourses);
          }}
        />

        {courseOrder.length > 0 || hiddenCourseIds.length > 0 ? (
          <Pressable onPress={handleReset} className="mt-6 items-center active:opacity-80">
            <Text className="text-base font-semibold text-red-400">Reset</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
