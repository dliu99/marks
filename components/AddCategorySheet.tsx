import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWhatIf } from '@/app/(protected)/(course)/_context';
import { getRemainingCategoryWeight } from '@/utils/grade-calculator';
import { playHaptic } from '@/utils/haptics';

const colors = {
  sheet: '#171717',
  border: '#44403c',
  label: '#f5f5f4',
  tertiaryLabel: '#78716c',
};

type AddCategorySheetProps = {
  existingWeightTotal: number;
  isWeighted: boolean;
};

export function AddCategorySheet({ existingWeightTotal, isWeighted }: AddCategorySheetProps) {
  const { addCategorySheetRef, addingCategory, addCategory, closeAddCategorySheet } = useWhatIf();
  const insets = useSafeAreaInsets();
  const [nameValue, setNameValue] = useState('');
  const [weightValue, setWeightValue] = useState('');
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
  const [shouldAutoFocusWeight, setShouldAutoFocusWeight] = useState(false);
  const weightInputRef = useRef<any>(null);
  const showsWeightField = isWeighted || existingWeightTotal > 0;

  const snapPoints = useMemo(
    () => [
      showsWeightField ? 224 + Math.max(insets.bottom, 10) : 172 + Math.max(insets.bottom, 10),
    ],
    [insets.bottom, showsWeightField]
  );

  const parsedWeight = parseFloat(weightValue.trim());
  const suggestedWeight = showsWeightField ? getRemainingCategoryWeight(existingWeightTotal) : null;
  const isAtKnownWeightLimit =
    showsWeightField &&
    suggestedWeight === null &&
    (Math.abs(existingWeightTotal - 1) <= 0.001 || existingWeightTotal >= 100);
  const canSave = !showsWeightField || (Number.isFinite(parsedWeight) && parsedWeight > 0);

  useEffect(() => {
    if (addingCategory) {
      setNameValue('');
      setWeightValue(suggestedWeight !== null ? String(suggestedWeight) : '');
      setShouldAutoFocus(!showsWeightField);
      setShouldAutoFocusWeight(showsWeightField);
      return;
    }

    setShouldAutoFocus(false);
    setShouldAutoFocusWeight(false);
  }, [addingCategory, showsWeightField, suggestedWeight]);

  const handleSave = useCallback(() => {
    if (!canSave) {
      return;
    }

    Keyboard.dismiss();
    playHaptic('success');
    addCategory(nameValue.trim() || 'Final Exam', showsWeightField ? parsedWeight : 0);
    setShouldAutoFocus(false);
    setShouldAutoFocusWeight(false);
    closeAddCategorySheet();
  }, [addCategory, canSave, closeAddCategorySheet, nameValue, parsedWeight, showsWeightField]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setShouldAutoFocus(false);
        setShouldAutoFocusWeight(false);
        closeAddCategorySheet();
      }
    },
    [closeAddCategorySheet]
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
      ref={addCategorySheetRef}
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
          <Text className="text-2xl font-bold tracking-[-0.6px] text-stone-100">Add Category</Text>

          {showsWeightField ? (
            <Text
              className={`text-sm leading-5 ${isAtKnownWeightLimit ? 'text-amber-400' : 'text-stone-400'}`}>
              {isAtKnownWeightLimit
                ? 'Weights already add up to '
                : 'Total weight of all categories: '}
              {Math.round(existingWeightTotal * 100) / 100}
            </Text>
          ) : null}

          <View className="gap-3">
            <View className="min-h-[52px] flex-row items-center justify-between gap-4">
              <Text className="text-lg font-medium text-stone-500">Name</Text>
              <BottomSheetTextInput
                autoFocus={shouldAutoFocus}
                blurOnSubmit={false}
                onChangeText={setNameValue}
                onSubmitEditing={() => {
                  if (showsWeightField) {
                    weightInputRef.current?.focus();
                    return;
                  }

                  handleSave();
                }}
                placeholder="Final Exam"
                placeholderTextColor={colors.tertiaryLabel}
                returnKeyType={showsWeightField ? 'next' : 'done'}
                style={{
                  color: colors.label,
                  flex: 1,
                  fontSize: 28,
                  fontWeight: '700',
                  letterSpacing: -0.8,
                  paddingVertical: 0,
                  textAlign: 'right',
                }}
                value={nameValue}
              />
            </View>

            {showsWeightField ? (
              <View className="min-h-[52px] flex-row items-center justify-between gap-4">
                <Text className="flex-1 text-lg font-medium text-stone-100">Weight</Text>
                <BottomSheetTextInput
                  autoFocus={shouldAutoFocusWeight}
                  ref={weightInputRef}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setWeightValue}
                  onSubmitEditing={handleSave}
                  placeholder={suggestedWeight !== null ? String(suggestedWeight) : '1'}
                  placeholderTextColor={colors.tertiaryLabel}
                  returnKeyType="done"
                  style={{
                    color: colors.label,
                    fontSize: 32,
                    fontWeight: '700',
                    letterSpacing: -0.8,
                    minWidth: 88,
                    paddingVertical: 0,
                    textAlign: 'right',
                  }}
                  value={weightValue}
                />
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            className={`min-h-[56px] items-center justify-center rounded-[18px] ${
              canSave ? 'bg-[#0A84FF] active:bg-[#409CFF]' : 'bg-[#292524] active:bg-[#1c1917]'
            }`}
            onPress={canSave ? handleSave : closeAddCategorySheet}>
            <Text
              className={`text-[17px] font-bold tracking-[-0.2px] ${
                canSave ? 'text-white' : 'text-stone-400'
              }`}>
              {canSave ? 'Add' : 'Cancel'}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
