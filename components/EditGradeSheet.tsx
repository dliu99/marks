import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Keyboard, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playHaptic } from '@/utils/haptics';

const colors = {
  sheet: '#171717',
  border: '#44403c',
  label: '#f5f5f4',
  tertiaryLabel: '#78716c',
};

type EditGradeSheetProps = {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  assignmentName: string | null;
  initialScore: string | null;
  initialTotalPoints: number | null;
  sourceScore?: string | null;
  sourceScorePercentage?: string | null;
  isNonPointsScore?: boolean;
  isDropped: boolean;
  isVirtual: boolean;
  isModified: boolean;
  onSave: (score: string | null, totalPoints: string | null) => void;
  onToggleDrop: () => void;
  onResetAssignment?: () => void;
  onClose: () => void;
};

export function EditGradeSheet({
  sheetRef,
  assignmentName,
  initialScore,
  initialTotalPoints,
  sourceScore,
  sourceScorePercentage,
  isNonPointsScore,
  isDropped,
  isVirtual,
  isModified,
  onSave,
  onToggleDrop,
  onResetAssignment,
  onClose,
}: EditGradeSheetProps) {
  const insets = useSafeAreaInsets();
  const [scoreValue, setScoreValue] = useState('');
  const [totalPointsValue, setTotalPointsValue] = useState('');

  const normalizedInitialScore = initialScore?.trim() ?? '';
  const normalizedInitialTotalPoints = initialTotalPoints?.toString() ?? '';
  const normalizedScoreValue = scoreValue.trim();
  const normalizedTotalPointsValue = totalPointsValue.trim();
  const effectiveScoreValue = normalizedScoreValue || normalizedInitialScore;
  const effectiveTotalPointsValue = normalizedTotalPointsValue || normalizedInitialTotalPoints;
  const hasRequiredValues = effectiveScoreValue !== '' && effectiveTotalPointsValue !== '';
  const hasChanges =
    (normalizedScoreValue !== '' && normalizedScoreValue !== normalizedInitialScore) ||
    (normalizedTotalPointsValue !== '' &&
      normalizedTotalPointsValue !== normalizedInitialTotalPoints);
  const canSave = hasRequiredValues && hasChanges;

  useEffect(() => {
    if (assignmentName === null) {
      return;
    }

    setScoreValue('');
    setTotalPointsValue('');
  }, [assignmentName, initialScore, initialTotalPoints]);

  const handleSave = useCallback(() => {
    if (!canSave) {
      return;
    }

    Keyboard.dismiss();
    playHaptic('success');
    onSave(effectiveScoreValue, effectiveTotalPointsValue);
    onClose();
  }, [canSave, effectiveScoreValue, effectiveTotalPointsValue, onClose, onSave]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleToggleDrop = useCallback(() => {
    Keyboard.dismiss();
    playHaptic('selection');
    onToggleDrop();
    onClose();
  }, [onClose, onToggleDrop]);

  const handleResetAssignment = useCallback(() => {
    if (!onResetAssignment) {
      return;
    }

    Keyboard.dismiss();
    playHaptic('warning');
    onResetAssignment();
    onClose();
  }, [onClose, onResetAssignment]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  const renderContainer = useCallback(
    (props: { children?: React.ReactNode }) => (
      <FullWindowOverlay>{props.children}</FullWindowOverlay>
    ),
    []
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

  const headerActionLabel = isVirtual ? 'Delete' : 'Reset';
  const showHeaderAction = isVirtual || isModified;

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      detached
      enableOverDrag={false}
      android_keyboardInputMode="adjustResize"
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backdropComponent={renderBackdrop}
      containerComponent={Platform.OS === 'ios' ? renderContainer : undefined}
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
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-2xl font-bold tracking-[-0.6px] text-stone-100">
                Edit Grade
              </Text>
              {assignmentName ? (
                <Text className="text-sm leading-5 text-stone-400" numberOfLines={1}>
                  {assignmentName}
                </Text>
              ) : null}
            </View>
            {showHeaderAction && onResetAssignment ? (
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.75}
                className="py-1"
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                onPress={handleResetAssignment}>
                <Text className="text-base font-semibold text-red-400">{headerActionLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {isNonPointsScore ? (
            <View className="rounded-2xl border border-stone-700 bg-stone-800/50 px-4 py-3">
              <Text className="text-sm leading-5 text-stone-300">
                Infinite Campus reports mark {sourceScore ?? '—'}
                {sourceScorePercentage ? ` (${sourceScorePercentage}%)` : ''}. What-if edits use the
                equivalent point value shown below.
              </Text>
            </View>
          ) : null}

          <View className="flex-row items-center justify-center gap-2 py-2">
            <BottomSheetTextInput
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setScoreValue}
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder={initialScore ?? '0'}
              placeholderTextColor={colors.tertiaryLabel}
              returnKeyType="done"
              style={{
                color: colors.label,
                flex: 1,
                fontSize: 32,
                fontWeight: '700',
                letterSpacing: -0.8,
                paddingVertical: 0,
                textAlign: 'right',
              }}
              value={scoreValue}
            />
            <Text className="text-[28px] font-bold text-stone-500">/</Text>
            <BottomSheetTextInput
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setTotalPointsValue}
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder={initialTotalPoints?.toString() ?? '100'}
              placeholderTextColor={colors.tertiaryLabel}
              returnKeyType="done"
              style={{
                color: colors.label,
                flex: 1,
                fontSize: 32,
                fontWeight: '700',
                letterSpacing: -0.8,
                paddingVertical: 0,
                textAlign: 'left',
              }}
              value={totalPointsValue}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            className={`min-h-[52px] items-center justify-center rounded-[18px] border bg-[#1c1917] ${
              isDropped
                ? 'border-stone-700 active:bg-[#292524]'
                : 'border-red-900/80 active:bg-[#3a1717]'
            }`}
            onPress={handleToggleDrop}>
            <Text
              className={`text-[16px] font-semibold tracking-[-0.2px] ${
                isDropped ? 'text-stone-300' : 'text-red-400'
              }`}>
              {isDropped ? 'Undrop grade' : 'Drop grade'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            className={`min-h-[56px] items-center justify-center rounded-[18px] ${
              canSave ? 'bg-[#0A84FF] active:bg-[#409CFF]' : 'bg-[#292524] active:bg-[#1c1917]'
            }`}
            onPress={canSave ? handleSave : handleCancel}>
            <Text
              className={`text-[17px] font-bold tracking-[-0.2px] ${
                canSave ? 'text-white' : 'text-stone-400'
              }`}>
              {canSave ? 'Save' : 'Cancel'}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
