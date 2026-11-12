import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { HeaderButton } from '@react-navigation/elements';
import { useCourseGrade } from '@/hooks/use-ic';
import { CategoryAccordion } from '@/components/CategoryAccordion';
import { GenericGradeCard } from '@/components/GenericGradeCard';
import { AddAssignmentSheet } from '@/components/AddAssignmentSheet';
import { AddCategorySheet } from '@/components/AddCategorySheet';
import { EditGradeSheet } from '@/components/EditGradeSheet';
import { FinalGradeCalculatorSheet } from '@/components/FinalGradeCalculatorSheet';
import { usePreferences } from '@/hooks/use-preferences';
import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryErrorState } from '@/components/QueryErrorState';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@react-native-menu/menu';
import BottomSheet, { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useWhatIf } from './_context';
import {
  applyWhatIfModifications,
  getCourseGradeBaseline,
  getCourseGradePercent,
  recalculateGrade,
  sanitizeWhatIfModifications,
  type ModifiedAssignment,
  type ModifiedCategory,
  type RecalculateGradeOptions,
} from '@/utils/grade-calculator';
import { playHaptic } from '@/utils/haptics';
import { useBottomContentPadding, useTransparentHeaderScrollPadding } from '@/utils/screen-spacing';
import { getAssignmentPointInputValue, isNonPointsScoringType } from '@/api/src/assignment-score';

export default function AllGradesModal() {
  const [editingGradeAssignment, setEditingGradeAssignment] = useState<ModifiedAssignment | null>(
    null
  );
  const router = useRouter();
  const contentTopPadding = useTransparentHeaderScrollPadding(16);
  const contentBottomPadding = useBottomContentPadding(24);
  const { sectionID, score, percent, taskName } = useLocalSearchParams<{
    sectionID: string;
    score?: string;
    percent?: string;
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

  const {
    modifications,
    virtualCategories,
    virtualAssignments,
    editGrade,
    editTotalPoints,
    toggleDrop,
    resetAssignment,
    resetCategory,
    resetAll,
    openAddCategorySheet,
    openAddSheet,
    removeVirtualCategory,
  } = useWhatIf();
  const { showAssignmentPercentImpact } = usePreferences();
  const finalCalculatorSheetRef = useRef<BottomSheet>(null);
  const editGradeSheetRef = useRef<BottomSheetModal>(null);

  const {
    modifiedCategories,
    calculatedGrade,
    originalPercent,
    hasModifications,
    isWeighted,
    gradeBaseline,
  } = useMemo(() => {
    const routePercent = percent ? parseFloat(percent) : null;

    if (!courseData?.categories) {
      return {
        modifiedCategories: [],
        calculatedGrade: null,
        originalPercent: routePercent,
        hasModifications: false,
        isWeighted: false,
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
    const weighted = courseData.task.groupWeighted;
    const baseline = getCourseGradeBaseline(courseData.task, routePercent);
    const calculated = recalculateGrade(modified, weighted, baseline);
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
      isWeighted: weighted,
      gradeBaseline: baseline,
    };
  }, [courseData, modifications, virtualAssignments, virtualCategories, percent]);

  const existingWeightTotal = useMemo(
    () => modifiedCategories.reduce((sum, category) => sum + category.weight, 0),
    [modifiedCategories]
  );

  useEffect(() => {
    if (!sectionID) {
      router.back();
    }
  }, [router, sectionID]);

  if (!sectionID) {
    return null;
  }

  const displayPercent = hasModifications ? (calculatedGrade?.percent ?? null) : originalPercent;
  const percentChange =
    hasModifications && originalPercent !== null && displayPercent !== null
      ? Math.round((displayPercent - originalPercent) * 100) / 100
      : null;
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

  const handleAddAssignment = (category: ModifiedCategory) => {
    openAddSheet(category.groupID);
  };

  const handleResetCategory = (category: ModifiedCategory) => {
    resetCategory(
      category.groupID,
      category.assignments.map((assignment) => assignment.objectSectionID)
    );
  };

  const handleDeleteCategory = (groupID: number) => {
    removeVirtualCategory(groupID);
  };

  const openFinalCalculatorSheet = () => {
    finalCalculatorSheetRef.current?.expand();
  };

  const closeFinalCalculatorSheet = () => {
    finalCalculatorSheetRef.current?.close();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: 'All Grades',
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: '#fff',
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
        <ScrollView
          className="flex-1 px-4"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: contentTopPadding,
            paddingBottom: contentBottomPadding,
          }}>
          <GenericGradeCard
            variant="default"
            taskName={taskName}
            displayPercent={displayPercent}
            displayScore={
              courseData?.task.progressScore ?? courseData?.task.score ?? (score || null)
            }
            percentChange={percentChange}
            hasModifications={hasModifications}
            actionSlot={
              courseData?.task.hasDetail && courseData.categories.length > 0 ? (
                <MenuView
                  onPressAction={({ nativeEvent }) => {
                    playHaptic('selection');

                    if (nativeEvent.event === 'final-calculator') {
                      openFinalCalculatorSheet();
                    }

                    if (nativeEvent.event === 'add-category') {
                      openAddCategorySheet();
                    }
                  }}
                  actions={[
                    {
                      id: 'final-calculator',
                      title: 'Final Grade Calculator',
                      image: 'plus.circle',
                      imageColor: 'white',
                    },
                    {
                      id: 'add-category',
                      title: 'Add Category',
                      image: 'folder.badge.plus',
                      imageColor: 'white',
                    },
                  ]}>
                  <TouchableOpacity className="rounded-full p-2">
                    <Ionicons name="ellipsis-horizontal" size={20} color="#a8a29e" />
                  </TouchableOpacity>
                </MenuView>
              ) : undefined
            }
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
                <Text className="text-2xl font-bold text-stone-100">Categories</Text>
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
              {modifiedCategories && modifiedCategories.length > 0 ? (
                <View>
                  {modifiedCategories.map((category) => (
                    <CategoryAccordion
                      key={category.groupID}
                      category={category}
                      allCategories={modifiedCategories}
                      isWeighted={isWeighted}
                      courseDisplayPercent={displayPercent}
                      gradeBaseline={gradeBaseline}
                      showPercentImpact={showAssignmentPercentImpact}
                      onEditGrade={handleOpenGradeEditor}
                      onAddAssignment={handleAddAssignment}
                      onResetCategory={handleResetCategory}
                      onDeleteCategory={handleDeleteCategory}
                    />
                  ))}
                </View>
              ) : (
                <View className="rounded-2xl border border-stone-700 p-5">
                  <Text className="text-center text-lg text-stone-400">No categories found</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
      <AddCategorySheet existingWeightTotal={existingWeightTotal} isWeighted={isWeighted} />
      <AddAssignmentSheet />
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
      <FinalGradeCalculatorSheet
        categories={modifiedCategories}
        currentPercent={displayPercent}
        gradeBaseline={gradeBaseline}
        isWeighted={isWeighted}
        onClose={closeFinalCalculatorSheet}
        sheetRef={finalCalculatorSheetRef}
      />
    </>
  );
}
