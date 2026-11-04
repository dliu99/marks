import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWhatIf } from '@/app/(protected)/(course)/_context';
import { playHaptic } from '@/utils/haptics';

const colors = {
  sheet: '#171717',
  card: '#1c1917',
  border: '#44403c',
  label: '#f5f5f4',
  secondaryLabel: '#a8a29e',
  tertiaryLabel: '#78716c',
  fill: '#292524',
  accent: '#0A84FF',
  accentPressed: '#409CFF',
  accentDisabled: 'rgba(10, 132, 255, 0.38)',
  white: '#FFFFFF',
};

export function AddAssignmentSheet() {
  const { addSheetRef, addingToGroupID, addAssignment, closeAddSheet } = useWhatIf();
  const insets = useSafeAreaInsets();
  const [scoreValue, setScoreValue] = useState('');
  const [totalPointsValue, setTotalPointsValue] = useState('');
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
  const previousGroupIDRef = useRef<number | null>(null);
  const totalPointsInputRef = useRef<any>(null);

  const snapPoints = useMemo(() => [178 + Math.max(insets.bottom, 10)], [insets.bottom]);
  const normalizedScoreValue = scoreValue.trim();
  const normalizedTotalPointsValue = totalPointsValue.trim();
  const canSave = normalizedScoreValue !== '' && normalizedTotalPointsValue !== '';

  useEffect(() => {
    if (addingToGroupID !== null && previousGroupIDRef.current !== addingToGroupID) {
      setScoreValue('');
      setTotalPointsValue('');
      setShouldAutoFocus(true);
    }

    if (addingToGroupID === null) {
      setShouldAutoFocus(false);
    }

    previousGroupIDRef.current = addingToGroupID;
  }, [addingToGroupID]);

  const handleSave = useCallback(() => {
    if (addingToGroupID === null || !canSave) {
      return;
    }

    const parsedTotalPoints = parseFloat(normalizedTotalPointsValue);

    if (!Number.isFinite(parsedTotalPoints) || parsedTotalPoints < 0) {
      return;
    }

    Keyboard.dismiss();
    playHaptic('success');
    addAssignment(addingToGroupID, normalizedScoreValue, parsedTotalPoints);
    setShouldAutoFocus(false);
    closeAddSheet();
  }, [
    addAssignment,
    addingToGroupID,
    canSave,
    closeAddSheet,
    normalizedScoreValue,
    normalizedTotalPointsValue,
  ]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setShouldAutoFocus(false);
        closeAddSheet();
      }
    },
    [closeAddSheet]
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
      ref={addSheetRef}
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
      backgroundStyle={[
        {
          backgroundColor: colors.sheet,
          borderColor: colors.border,
          borderRadius: 30,
          borderWidth: 1,
          elevation: 18,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.22,
          shadowRadius: 24,
        },
      ]}
      handleIndicatorStyle={{
        backgroundColor: colors.tertiaryLabel,
        borderRadius: 999,
        height: 5,
        width: 36,
      }}>
      <BottomSheetView
        style={{
          paddingBottom: Math.max(insets.bottom, 12) + 10,
        }}>
        <View className="gap-4 px-[18px] pt-1">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-2xl font-bold tracking-[-0.6px] text-stone-100">
                Add Assignment
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-center gap-2 py-2">
            <BottomSheetTextInput
              autoFocus={shouldAutoFocus}
              blurOnSubmit={false}
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setScoreValue}
              onSubmitEditing={() => totalPointsInputRef.current?.focus()}
              placeholder="0"
              placeholderTextColor={colors.tertiaryLabel}
              returnKeyType="next"
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
              ref={totalPointsInputRef}
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setTotalPointsValue}
              onSubmitEditing={handleSave}
              placeholder="100"
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
            className={`min-h-[56px] items-center justify-center rounded-[18px] ${
              canSave ? 'bg-[#0A84FF] active:bg-[#409CFF]' : 'bg-[#292524] active:bg-[#1c1917]'
            }`}
            onPress={canSave ? handleSave : closeAddSheet}>
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
