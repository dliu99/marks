import { ScrollView, Text, View, Switch, Pressable } from 'react-native';
import { usePreferences } from '@/hooks/use-preferences';
import {
  setDefaultHomePage,
  setShowAssignmentPercentImpact,
  setShowCoursePercentImpact,
} from '@/utils/storage';
import { playHaptic } from '@/utils/haptics';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBottomContentPadding, useTransparentHeaderScrollPadding } from '@/utils/screen-spacing';

function PreferenceRow({
  title,
  description,
  value,
  onValueChange,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View className="mb-4 rounded-2xl border border-stone-700 p-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-xl font-semibold text-white">{title}</Text>
          {description ? (
            <Text className="mt-2 text-base leading-6 text-stone-400">{description}</Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={(nextValue) => {
            playHaptic('toggle');
            onValueChange(nextValue);
          }}
          trackColor={{ false: '#44403c', true: '#22c55e' }}
          thumbColor="#fff"
        />
      </View>
    </View>
  );
}

function PreferenceLinkRow({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        playHaptic('navigation');
        onPress();
      }}
      className="mb-4 rounded-2xl border border-stone-700 p-5 active:scale-[0.98] active:opacity-80">
      <View className="flex-row items-center justify-between gap-4">
        <Text className="flex-1 text-xl font-semibold text-white">{title}</Text>
        <Ionicons name="chevron-forward" size={22} color="#ffffff" />
      </View>
    </Pressable>
  );
}

export default function Preferences() {
  const { defaultHomePage, showAssignmentPercentImpact, showCoursePercentImpact } =
    usePreferences();
  const contentTopPadding = useTransparentHeaderScrollPadding(24);
  const contentBottomPadding = useBottomContentPadding(32, { includesNativeTabBar: true });

  return (
    <View className="flex-1 bg-neutral-900">
      <ScrollView
        className="flex-1 px-5"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: contentTopPadding,
          paddingBottom: contentBottomPadding,
        }}
        keyboardShouldPersistTaps="handled">
        <PreferenceLinkRow
          title="Reorder courses"
          onPress={() => {
            router.push('/(protected)/(tabs)/profile/reorder-courses');
          }}
        />
        <PreferenceLinkRow
          title="Select term"
          onPress={() => {
            router.push('/(protected)/(tabs)/profile/select-term');
          }}
        />
        <PreferenceRow
          title="Open grades page by default on app launch"
          value={defaultHomePage === 'grades'}
          onValueChange={(value) => {
            setDefaultHomePage(value ? 'grades' : 'dashboard');
          }}
        />
        <PreferenceRow
          title="Show percent impact across courses"
          value={showCoursePercentImpact}
          onValueChange={setShowCoursePercentImpact}
        />
        <PreferenceRow
          title="Show percent impact across assignments"
          value={showAssignmentPercentImpact}
          onValueChange={setShowAssignmentPercentImpact}
        />
      </ScrollView>
    </View>
  );
}
