import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { MenuView } from '@react-native-menu/menu';
import { useCallback, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { Keyboard, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  dropAssignmentFromCalculation,
  getRemainingCategoryWeight,
  isCountedGradeAssignment,
  recalculateGrade,
  type ModifiedCategory,
  type RecalculateGradeOptions,
} from '@/utils/grade-calculator';
import { playHaptic } from '@/utils/haptics';

const colors = {
  sheet: '#171717',
  border: '#44403c',
  label: '#f5f5f4',
  secondaryLabel: '#a8a29e',
  tertiaryLabel: '#78716c',
};

type FinalGradeCalculatorSheetProps = {
  categories: ModifiedCategory[];
  currentPercent: number | null;
  gradeBaseline?: RecalculateGradeOptions;
  isWeighted: boolean;
  onClose: () => void;
  sheetRef: RefObject<BottomSheet | null>;
};

type CalculationResult = {
  requiredScore: number;
  requiredPercent: number;
  targetPercent: number;
  totalPoints: number;
};

type Assignment = ModifiedCategory['assignments'][number];

const OPTIONAL_CATEGORY_ID = 'optional-category';
const CATEGORY_PREFIX = 'cat:';
const ASSIGNMENT_PREFIX = 'asg:';

function getAssignmentDenominator(assignment: Assignment) {
  return assignment.totalPoints * assignment.multiplier;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function createFinalAssignment(score: number, totalPoints: number) {
  return {
    objectSectionID: Number.MIN_SAFE_INTEGER,
    assignmentName: 'Final Grade',
    sectionID: 0,
    dueDate: new Date().toISOString(),
    assignedDate: new Date().toISOString(),
    scoreModifiedDate: new Date().toISOString(),
    termIDs: [],
    score: String(score),
    scorePoints: String(score),
    scorePercentage: totalPoints > 0 ? ((score / totalPoints) * 100).toFixed(2) : null,
    scoringType: 'p',
    totalPoints,
    comments: null,
    feedback: null,
    late: null,
    missing: null,
    dropped: null,
    incomplete: null,
    turnedIn: null,
    notGraded: false,
    multiplier: 1,
    isModified: true,
    originalScore: null,
    originalScorePoints: null,
    originalScorePercentage: null,
    originalScoringType: null,
    originalTotalPoints: null,
    originalDropped: null,
  } satisfies ModifiedCategory['assignments'][number];
}

function addFinalAssignmentToCategories({
  categories,
  score,
  selectedCategory,
  selectedWeight,
  totalPoints,
}: {
  categories: ModifiedCategory[];
  score: number;
  selectedCategory: ModifiedCategory | null;
  selectedWeight: number;
  totalPoints: number;
}) {
  const finalAssignment = createFinalAssignment(score, totalPoints);

  if (selectedCategory) {
    return categories.map((category) =>
      category.groupID === selectedCategory.groupID
        ? { ...category, assignments: [...category.assignments, finalAssignment] }
        : category
    );
  }

  return [
    ...categories,
    {
      groupID: Number.MIN_SAFE_INTEGER,
      name: 'New category',
      weight: selectedWeight,
      progress: null,
      assignments: [finalAssignment],
      isVirtual: true,
    },
  ];
}

export function FinalGradeCalculatorSheet({
  categories,
  currentPercent: _currentPercent,
  gradeBaseline,
  isWeighted,
  onClose,
  sheetRef,
}: FinalGradeCalculatorSheetProps) {
  const insets = useSafeAreaInsets();
  const [selectedOptionID, setSelectedOptionID] = useState<string | null>(null);
  const [selectedAssignmentID, setSelectedAssignmentID] = useState<number | null>(null);
  const [targetGradeValue, setTargetGradeValue] = useState('');
  const [totalPointsValue, setTotalPointsValue] = useState('');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isResultModalVisible, setIsResultModalVisible] = useState(false);
  const [buttonText, setButtonText] = useState('Gulp');
  const [buttonText2, setButtonText2] = useState('Done');
  const rerollButtonLabels = useCallback(() => {
    const high = ['Gulp', "It's over", "I'm finished", 'Wow', 'Yikes'];
    const low = [
      'Easy',
      'Light work',
      'Calm',
      'Done',
      'No sweat',
      'Piece of cake',
      'Sorted',
      'Ok',
      'Okay',
      'Ez',
    ];
    setButtonText(high[Math.floor(Math.random() * high.length)]);
    setButtonText2(low[Math.floor(Math.random() * low.length)]);
  }, []);
  const totalPointsInputRef = useRef<any>(null);

  const optionalWeight = useMemo(
    () =>
      getRemainingCategoryWeight(categories.reduce((sum, category) => sum + category.weight, 0)),
    [categories]
  );
  const effectiveOptionID =
    selectedOptionID === null && optionalWeight !== null ? OPTIONAL_CATEGORY_ID : selectedOptionID;

  const selectedCategory = useMemo(
    () =>
      effectiveOptionID === null || effectiveOptionID === OPTIONAL_CATEGORY_ID
        ? null
        : (categories.find((category) => category.groupID === parseInt(effectiveOptionID, 10)) ??
          null),
    [categories, effectiveOptionID]
  );
  const selectedAssignment = useMemo(
    () =>
      selectedCategory && selectedAssignmentID !== null
        ? (selectedCategory.assignments.find((a) => a.objectSectionID === selectedAssignmentID) ??
          null)
        : null,
    [selectedCategory, selectedAssignmentID]
  );
  const selectedWeight =
    effectiveOptionID === OPTIONAL_CATEGORY_ID
      ? (optionalWeight ?? 0)
      : (selectedCategory?.weight ?? 0);
  const isEmptyCategory =
    effectiveOptionID === OPTIONAL_CATEGORY_ID || (selectedCategory?.assignments.length ?? 0) === 0;
  const shouldIgnoreSelectedAssignment =
    selectedAssignment !== null && isCountedGradeAssignment(selectedAssignment);
  const hasValidTotalPointsInput =
    selectedAssignment !== null || isEmptyCategory || totalPointsValue.trim() !== '';
  const canSave =
    effectiveOptionID !== null && targetGradeValue.trim() !== '' && hasValidTotalPointsInput;

  const snapPoints = useMemo(
    () => [322 + (shouldIgnoreSelectedAssignment ? 30 : 0) + Math.max(insets.bottom, 10)],
    [insets.bottom, shouldIgnoreSelectedAssignment]
  );

  const menuActions = useMemo(() => {
    return categories.map((category) => {
      const baseID = `${CATEGORY_PREFIX}${category.groupID}`;
      if (category.assignments.length === 0) {
        return { id: baseID, title: category.name };
      }
      const addAction = {
        id: baseID,
        title: 'Add an assignment (+)',
      };
      const assignmentActions = category.assignments.map((assignment) => ({
        id: `${ASSIGNMENT_PREFIX}${category.groupID}:${assignment.objectSectionID}`,
        title: assignment.assignmentName,
      }));
      return {
        id: baseID,
        title: category.name,
        subactions:
          Platform.OS === 'ios'
            ? [...assignmentActions, addAction]
            : [addAction, ...assignmentActions],
      };
    });
  }, [categories]);

  const resetSheet = useCallback(() => {
    setSelectedOptionID(null);
    setSelectedAssignmentID(null);
    setTargetGradeValue('');
    setTotalPointsValue(optionalWeight !== null ? '100' : '');
    setResult(null);
    setIsResultModalVisible(false);
  }, [optionalWeight]);

  const handleMenuSelect = useCallback(
    (eventID: string) => {
      if (eventID === OPTIONAL_CATEGORY_ID) {
        setSelectedOptionID(OPTIONAL_CATEGORY_ID);
        setSelectedAssignmentID(null);
        setTotalPointsValue('100');
        setResult(null);
        return;
      }
      if (eventID.startsWith(ASSIGNMENT_PREFIX)) {
        const [groupIDStr, assignmentIDStr] = eventID.slice(ASSIGNMENT_PREFIX.length).split(':');
        const groupID = parseInt(groupIDStr, 10);
        const assignmentID = parseInt(assignmentIDStr, 10);
        const category = categories.find((c) => c.groupID === groupID);
        const assignment = category?.assignments.find((a) => a.objectSectionID === assignmentID);
        if (!category || !assignment) return;
        setSelectedOptionID(String(groupID));
        setSelectedAssignmentID(assignmentID);
        setTotalPointsValue(String(getAssignmentDenominator(assignment)));
        setResult(null);
        return;
      }
      const groupIDStr = eventID.startsWith(CATEGORY_PREFIX)
        ? eventID.slice(CATEGORY_PREFIX.length)
        : eventID;
      const groupID = parseInt(groupIDStr, 10);
      const nextCategory = categories.find((c) => c.groupID === groupID) ?? null;
      setSelectedOptionID(String(groupID));
      setSelectedAssignmentID(null);
      setTotalPointsValue(
        nextCategory === null || nextCategory.assignments.length === 0 ? '100' : ''
      );
      setResult(null);
    },
    [categories]
  );

  const handleClose = useCallback(() => {
    resetSheet();
    onClose();
  }, [onClose, resetSheet]);

  const handleSave = useCallback(() => {
    if (effectiveOptionID === null || !canSave) {
      return;
    }

    const parsedTargetPercent = parseFloat(targetGradeValue.trim());
    const trimmedTotalPointsValue = totalPointsValue.trim();
    const parsedTotalPoints =
      selectedAssignment !== null
        ? getAssignmentDenominator(selectedAssignment)
        : trimmedTotalPointsValue === '' && isEmptyCategory
          ? 100
          : parseFloat(trimmedTotalPointsValue);
    if (
      !Number.isFinite(parsedTargetPercent) ||
      !Number.isFinite(parsedTotalPoints) ||
      parsedTotalPoints <= 0
    ) {
      return;
    }

    const totalPoints = parsedTotalPoints;
    const targetPercent = roundToTwo(parsedTargetPercent);

    if (isWeighted && selectedWeight <= 0) {
      return;
    }

    const calculationCategories =
      shouldIgnoreSelectedAssignment && selectedAssignment !== null
        ? dropAssignmentFromCalculation(categories, selectedAssignment.objectSectionID)
        : categories;

    const gradeWithZero = recalculateGrade(
      addFinalAssignmentToCategories({
        categories: calculationCategories,
        score: 0,
        selectedCategory,
        selectedWeight,
        totalPoints,
      }),
      isWeighted,
      gradeBaseline
    ).percent;
    const gradeWithFullCredit = recalculateGrade(
      addFinalAssignmentToCategories({
        categories: calculationCategories,
        score: totalPoints,
        selectedCategory,
        selectedWeight,
        totalPoints,
      }),
      isWeighted,
      gradeBaseline
    ).percent;
    const gradePointsPerScorePoint = (gradeWithFullCredit - gradeWithZero) / totalPoints;

    if (!Number.isFinite(gradePointsPerScorePoint) || gradePointsPerScorePoint === 0) {
      return;
    }

    const requiredScore = (targetPercent - gradeWithZero) / gradePointsPerScorePoint;

    const normalizedRequiredScore = roundToTwo(requiredScore);
    const requiredPercent = roundToTwo((normalizedRequiredScore / totalPoints) * 100);

    Keyboard.dismiss();
    playHaptic('success');
    setResult({
      requiredScore: normalizedRequiredScore,
      requiredPercent,
      targetPercent,
      totalPoints,
    });
    rerollButtonLabels();
    setIsResultModalVisible(true);
  }, [
    canSave,
    categories,
    effectiveOptionID,
    gradeBaseline,
    isEmptyCategory,
    isWeighted,
    rerollButtonLabels,
    selectedAssignment,
    selectedCategory,
    selectedWeight,
    shouldIgnoreSelectedAssignment,
    targetGradeValue,
    totalPointsValue,
  ]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        handleClose();
      }
    },
    [handleClose]
  );

  const renderBackdrop = useCallback(
    (props: ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={Platform.OS === 'ios' ? 0.22 : 0.4}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      detached
      bottomInset={Math.max(insets.bottom, 10)}
      style={{ marginHorizontal: 12 }}
      enablePanDownToClose
      enableOverDrag={false}
      android_keyboardInputMode="adjustResize"
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backdropComponent={renderBackdrop}
      onChange={handleSheetChanges}
      backgroundStyle={{
        backgroundColor: colors.sheet,
        borderColor: colors.border,
        borderRadius: 30,
        borderWidth: 1,
        elevation: 18,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.22,
        shadowRadius: 24,
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.tertiaryLabel,
        borderRadius: 999,
        height: 5,
        width: 36,
      }}>
      <BottomSheetView style={{ paddingBottom: Math.max(insets.bottom, 12) + 10 }}>
        <View className="gap-4 px-[18px] pt-1">
          <Text className="text-2xl font-bold text-stone-100">Final Grade Calculator</Text>

          <MenuView
            onPressAction={({ nativeEvent }) => {
              playHaptic('selection');
              handleMenuSelect(nativeEvent.event);
            }}
            actions={menuActions}>
            <Pressable className="min-h-[52px] flex-row items-center justify-between gap-4">
              <Text
                className="flex-1 text-lg font-medium text-stone-100"
                numberOfLines={2}
                style={{ minWidth: 140 }}>
                Select or add your final assignment{optionalWeight !== null ? ' (optional)' : ''}
              </Text>
              <Text
                className="text-right text-lg text-stone-500"
                ellipsizeMode="tail"
                numberOfLines={1}
                style={{ flexShrink: 1, maxWidth: '52%' }}>
                {selectedOptionID === null && optionalWeight !== null
                  ? `New category (Weight: ${optionalWeight})`
                  : selectedOptionID === null
                    ? 'Choose'
                    : selectedAssignment
                      ? `${selectedCategory?.name} • ${selectedAssignment.assignmentName}`
                      : (selectedCategory?.name ?? 'Edit')}
              </Text>
            </Pressable>
          </MenuView>

          {shouldIgnoreSelectedAssignment ? (
            <Text className="-mt-3 text-[13px] font-medium text-stone-500">
              Assignment has a grade; ignoring
            </Text>
          ) : null}

          {effectiveOptionID !== null ? (
            <>
              <View className="min-h-[52px] flex-row items-center justify-between gap-4">
                <Text className="flex-1 text-lg font-medium text-stone-100">
                  What final grade do you want?
                </Text>
                <View className="flex-row items-center gap-1">
                  <BottomSheetTextInput
                    blurOnSubmit={false}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    onChangeText={(value) => {
                      setTargetGradeValue(value);
                      setResult(null);
                    }}
                    onSubmitEditing={() => {
                      if (selectedAssignment) {
                        handleSave();
                      } else {
                        totalPointsInputRef.current?.focus();
                      }
                    }}
                    placeholder="90"
                    placeholderTextColor={colors.tertiaryLabel}
                    returnKeyType={selectedAssignment ? 'done' : 'next'}
                    style={{
                      color: colors.label,
                      fontSize: 32,
                      fontWeight: '700',
                      letterSpacing: -0.8,
                      minWidth: 88,
                      paddingVertical: 0,
                      textAlign: 'right',
                    }}
                    value={targetGradeValue}
                  />
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: 32,
                      fontWeight: '700',
                      letterSpacing: -0.8,
                    }}>
                    %
                  </Text>
                </View>
              </View>

              <View className="min-h-[52px] flex-row items-center justify-between gap-4 py-2">
                <Text className="flex-1 text-lg font-medium text-stone-100">
                  How many points is your final grade worth?
                  <Text className="text-sm text-stone-500">
                    {selectedAssignment
                      ? '\nFrom selected assignment'
                      : isEmptyCategory
                        ? '\nNew category'
                        : '\nRequired: This category has other assignments already'}
                  </Text>
                </Text>
                <BottomSheetTextInput
                  ref={totalPointsInputRef}
                  editable={selectedAssignment === null}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={(value) => {
                    setTotalPointsValue(value);
                    setResult(null);
                  }}
                  onSubmitEditing={handleSave}
                  placeholder="0"
                  placeholderTextColor={colors.tertiaryLabel}
                  returnKeyType="done"
                  style={{
                    color: selectedAssignment ? colors.secondaryLabel : colors.label,
                    fontSize: 32,
                    fontWeight: '700',
                    letterSpacing: -0.8,
                    paddingVertical: 0,
                    minWidth: 88,
                    textAlign: 'right',
                  }}
                  value={totalPointsValue}
                />
              </View>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            className={`min-h-[56px] items-center justify-center rounded-[18px] ${
              canSave ? 'bg-[#0A84FF] active:bg-[#409CFF]' : 'bg-[#292524] active:bg-[#1c1917]'
            }`}
            onPress={canSave ? handleSave : handleClose}>
            <Text
              className={`text-[17px] font-bold tracking-[-0.2px] ${
                canSave ? 'text-white' : 'text-stone-400'
              }`}>
              {canSave ? 'Calculate' : 'Cancel'}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
      <Modal
        animationType="fade"
        transparent
        visible={isResultModalVisible}
        onDismiss={() => setResult(null)}
        onRequestClose={() => setIsResultModalVisible(false)}>
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}>
          <View className="w-full max-w-[380px] rounded-3xl border border-stone-700 bg-neutral-900 px-7 pb-7 pt-12">
            <Text className="text-center text-6xl font-extrabold  text-stone-100">
              {result?.requiredPercent}%
            </Text>
            {result ? (
              <Text className="mt-1 text-center text-2xl font-semibold tracking-[-0.3px] text-green-400">
                ({roundToTwo(result.requiredScore)} / {roundToTwo(result.totalPoints)} pts)
              </Text>
            ) : null}
            <Text className="mt-6 text-center text-[15px] font-medium leading-[22px] text-stone-400">
              You need a {result?.requiredPercent}% to land a {result?.targetPercent}% overall.
            </Text>
            <Pressable
              accessibilityRole="button"
              className="mt-10 min-h-[52px] items-center justify-center rounded-[18px] bg-[#0A84FF] active:bg-[#409CFF]"
              onPress={() => setIsResultModalVisible(false)}>
              <Text className="text-[17px] font-bold tracking-[-0.2px] text-white">
                {result && result.requiredPercent > 100 ? buttonText : buttonText2}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </BottomSheet>
  );
}
