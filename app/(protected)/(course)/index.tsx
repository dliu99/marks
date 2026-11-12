import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { HeaderButton } from '@react-navigation/elements';
import { useCourseGrade } from '@/hooks/use-ic';
import { GradeCard } from '@/components/GradeCard';
import { GenericGradeCard } from '@/components/GenericGradeCard';
import { StandardsList } from '@/components/StandardsList';
import { EditGradeSheet } from '@/components/EditGradeSheet';
import { usePreferences } from '@/hooks/use-preferences';
import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryErrorState } from '@/components/QueryErrorState';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useWhatIf } from './_context';
import {
  applyWhatIfModifications,
  calculatePercentImpact,
  getCourseGradeBaseline,
  getCourseGradePercent,
  recalculateGrade,
  sanitizeWhatIfModifications,
  type ModifiedAssignment,
  type RecalculateGradeOptions,
} from '@/utils/grade-calculator';
import { playHaptic } from '@/utils/haptics';
import { releaseCourseModalNavigationLock } from '@/utils/assignment-modal-navigation';
import { useBottomContentPadding, useTransparentHeaderScrollPadding } from '@/utils/screen-spacing';
import {
  getAssignmentPointInputValue,
  hasAssignmentScore,
  isNonPointsScoringType,
} from '@/api/src/assignment-score';

type AssignmentWithImpact = ModifiedAssignment & {
  percentImpact: number;
  categoryWeight: number;
};

const RECENT_GRADES_DEFAULT_LIMIT = 2;
const RECENT_GRADES_EXPANDED_LIMIT = 3;
const RECENT_GRADES_EXPANDED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function wasUpdatedWithinLastSevenDays(assignment: AssignmentWithImpact, now: number) {
  if (!assignment.scoreModifiedDate) {
    return false;
  }

  const modifiedAt = new Date(assignment.scoreModifiedDate).getTime();

  return (
    Number.isFinite(modifiedAt) &&
    modifiedAt <= now &&
    now - modifiedAt <= RECENT_GRADES_EXPANDED_WINDOW_MS
  );
}

export default function CourseModal() {
  const [editingGradeAssignment, setEditingGradeAssignment] = useState<ModifiedAssignment | null>(
    null
  );
  const router = useRouter();
  const editGradeSheetRef = useRef<BottomSheetModal>(null);
  const contentTopPadding = useTransparentHeaderScrollPadding(16);
  const contentBottomPadding = useBottomContentPadding(24);
  const { sectionID, courseName, teacher, score, percent, termName, taskName } =
    useLocalSearchParams<{
      sectionID: string;
      courseName: string;
      teacher: string;
      score?: string;
      percent?: string;
      termName: string;
      taskName: string;
    }>();

  const {
    data: loadedCourseData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useCourseGrade(sectionID ? parseInt(sectionID, 10) : 0);
  // Course detail comes only from the latest successful request.
  const courseData = error ? undefined : loadedCourseData;

  useEffect(() => {
    releaseCourseModalNavigationLock();

    return () => {
      releaseCourseModalNavigationLock();
    };
  }, []);

  useEffect(() => {
    if (!sectionID) {
      router.back();
    }
  }, [router, sectionID]);

  const {
    modifications,
    virtualCategories,
    virtualAssignments,
    editGrade,
    editTotalPoints,
    toggleDrop,
    resetAssignment,
    resetAll,
  } = useWhatIf();
  const { showAssignmentPercentImpact } = usePreferences();

  const { modifiedCategories, calculatedGrade, originalPercent, hasModifications, gradeBaseline } =
    useMemo(() => {
      const routePercent = percent ? parseFloat(percent) : null;

      if (!courseData?.categories) {
        return {
          modifiedCategories: [],
          calculatedGrade: null,
          originalPercent: routePercent,
          hasModifications: false,
          gradeBaseline: undefined as RecalculateGradeOptions | undefined,
        };
      }

      const effectiveModifications = sanitizeWhatIfModifications(
        courseData.categories,
        modifications
      );
      const modified = applyWhatIfModifications(
        courseData.categories,
        effectiveModifications,
        virtualAssignments,
        virtualCategories
      );
      const isWeighted = courseData.task.groupWeighted;
      const baseline = getCourseGradeBaseline(courseData.task, routePercent);
      const calculated = recalculateGrade(modified, isWeighted, baseline);
      const origPercent = getCourseGradePercent(courseData.task, routePercent);
      const hasMods =
        effectiveModifications.size > 0 ||
        virtualAssignments.length > 0 ||
        virtualCategories.length > 0;

      return {
        modifiedCategories: modified,
        calculatedGrade: calculated,
        originalPercent: origPercent,
        hasModifications: hasMods,
        gradeBaseline: baseline,
      };
    }, [courseData, modifications, virtualAssignments, virtualCategories, percent]);

  const displayPercent = hasModifications ? (calculatedGrade?.percent ?? null) : originalPercent;

  const recentGrades = useMemo(() => {
    if (!modifiedCategories.length) return [];

    const isWeighted = courseData?.task.groupWeighted ?? false;

    const allAssignments: AssignmentWithImpact[] = [];
    for (const category of modifiedCategories) {
      for (const assignment of category.assignments) {
        const percentImpact = calculatePercentImpact(
          assignment,
          modifiedCategories,
          isWeighted,
          displayPercent,
          gradeBaseline
        );

        allAssignments.push({
          ...assignment,
          percentImpact: Math.round(percentImpact * -100) / 100,
          categoryWeight: category.weight,
        });
      }
    }

    const gradedAssignments = allAssignments
      .filter((assignment) => hasAssignmentScore(assignment) || assignment.missing)
      .sort((a, b) => {
        const dateA = a.scoreModifiedDate || a.dueDate;
        const dateB = b.scoreModifiedDate || b.dueDate;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

    const now = Date.now();
    const recentLimit =
      gradedAssignments
        .slice(0, RECENT_GRADES_EXPANDED_LIMIT)
        .every((assignment) => wasUpdatedWithinLastSevenDays(assignment, now)) &&
      gradedAssignments.length >= RECENT_GRADES_EXPANDED_LIMIT
        ? RECENT_GRADES_EXPANDED_LIMIT
        : RECENT_GRADES_DEFAULT_LIMIT;

    return gradedAssignments.slice(0, recentLimit);
  }, [courseData, displayPercent, gradeBaseline, modifiedCategories]);

  const lastUpdated = useMemo(() => {
    for (const assignment of recentGrades) {
      if (assignment.scoreModifiedDate) {
        return assignment.scoreModifiedDate;
      }
    }
    return null;
  }, [recentGrades]);

  if (!sectionID) {
    return null;
  }

  const percentChange =
    hasModifications && originalPercent !== null && displayPercent !== null
      ? Math.round((displayPercent - originalPercent) * 100) / 100
      : null;
  const handleSeeAllGrades = () => {
    playHaptic('navigation');
    router.push({
      pathname: '/(protected)/(course)/all-grades',
      params: {
        sectionID,
        courseName,
        teacher,
        score: score ?? '',
        percent: percent ?? '',
        termName,
        taskName,
      },
    });
  };

  const handleOpenGradeEditor = (assignment: ModifiedAssignment) => {
    setEditingGradeAssignment(assignment);
    editGradeSheetRef.current?.present();
  };

  const handleSaveGrade = (score: string | null, totalPoints: string | null) => {
    if (!editingGradeAssignment) {
      return;
    }

    editGrade(editingGradeAssignment.objectSectionID, score);
    editTotalPoints(editingGradeAssignment.objectSectionID, totalPoints);
  };

  const handleCloseGradeEditor = () => {
    editGradeSheetRef.current?.dismiss();
    setEditingGradeAssignment(null);
  };

  const handleToggleDropFromEditor = () => {
    if (!editingGradeAssignment) {
      return;
    }

    toggleDrop(editingGradeAssignment.objectSectionID, editingGradeAssignment.dropped ?? false);
  };

  const handleResetAssignmentFromEditor = () => {
    if (!editingGradeAssignment) {
      return;
    }

    resetAssignment(editingGradeAssignment.objectSectionID);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: courseName,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: '#fff',
          headerRight: ({ tintColor }) => (
            <HeaderButton accessibilityLabel="Close" onPress={() => router.dismiss()}>
              <View className="h-11 w-11 items-center justify-center">
                <Ionicons name="close" size={27} color={tintColor ?? '#ffffff'} />
              </View>
            </HeaderButton>
          ),
        }}
      />
      <View className="flex-1 bg-neutral-900">
        <ScrollView
          className="flex-1 px-4"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: contentTopPadding,
            paddingBottom: contentBottomPadding,
          }}>
          <GenericGradeCard
            variant="chart"
            taskName={taskName}
            displayPercent={displayPercent}
            displayScore={
              courseData?.task.progressScore ?? courseData?.task.score ?? (score || null)
            }
            percentChange={percentChange}
            hasModifications={hasModifications}
            updatedAt={lastUpdated}
            chartCategories={courseData?.categories}
            gradeBaseline={gradeBaseline}
            isWeighted={courseData?.task.groupWeighted ?? false}
          />

          {isLoading ? (
            <View className="py-10">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : error ? (
            <QueryErrorState
              variant="inline"
              error={error}
              subject="grades for this course"
              onRetry={async () => {
                await refetch();
              }}
              retrying={isFetching}
            />
          ) : (
            <>
              <View className="mb-4 flex-row items-center justify-between">
                <Text className="text-2xl font-bold text-stone-100">Recent Grades</Text>
                {hasModifications && (
                  <TouchableOpacity
                    onPress={() => {
                      playHaptic('warning');
                      resetAll();
                    }}
                    className="flex-row items-center py-1">
                    <Ionicons name="refresh" size={18} color="#f87171" />
                    <Text className="ml-1 text-base text-red-400">Reset</Text>
                  </TouchableOpacity>
                )}
              </View>
              {recentGrades.length > 0 ? (
                recentGrades.map((assignment) => (
                  <GradeCard
                    key={assignment.objectSectionID}
                    assignment={assignment}
                    percentImpact={
                      showAssignmentPercentImpact ? assignment.percentImpact : undefined
                    }
                    isModified={assignment.isModified}
                    onEditGradePress={() => handleOpenGradeEditor(assignment)}
                  />
                ))
              ) : (
                <View className="rounded-2xl border border-stone-700 p-5">
                  <Text className="text-center text-lg text-stone-400">No grades yet</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleSeeAllGrades}
                className="mt-2 flex-row items-center justify-between rounded-2xl border border-stone-700 px-6 py-5 active:scale-[0.98] active:opacity-80">
                <Text className="text-lg font-medium text-stone-100">See all grades</Text>
                <Ionicons name="arrow-forward" size={22} color="#a8a29e" />
              </TouchableOpacity>

              <StandardsList standards={courseData?.standards} />
            </>
          )}
        </ScrollView>
      </View>

      <EditGradeSheet
        sheetRef={editGradeSheetRef}
        assignmentName={editingGradeAssignment?.assignmentName ?? null}
        initialScore={
          editingGradeAssignment ? getAssignmentPointInputValue(editingGradeAssignment) : null
        }
        initialTotalPoints={editingGradeAssignment?.totalPoints ?? null}
        sourceScore={editingGradeAssignment?.score ?? null}
        sourceScorePercentage={editingGradeAssignment?.scorePercentage ?? null}
        isNonPointsScore={isNonPointsScoringType(editingGradeAssignment?.scoringType)}
        isDropped={editingGradeAssignment?.dropped ?? false}
        isVirtual={(editingGradeAssignment?.objectSectionID ?? 0) < 0}
        isModified={editingGradeAssignment?.isModified ?? false}
        onSave={handleSaveGrade}
        onToggleDrop={handleToggleDropFromEditor}
        onResetAssignment={handleResetAssignmentFromEditor}
        onClose={handleCloseGradeEditor}
      />
    </>
  );
}
