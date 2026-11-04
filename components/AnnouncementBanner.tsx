import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Announcement } from '@/api/src/types';
import { playHaptic } from '@/utils/haptics';

type AnnouncementBannerProps = {
  announcement: Announcement;
  onDismiss: (id: string) => void;
};

export function AnnouncementBanner({ announcement, onDismiss }: AnnouncementBannerProps) {
  const insets = useSafeAreaInsets();

  const openCta = () => {
    if (!announcement.ctaUrl) return;
    playHaptic('navigation');
    void Linking.openURL(announcement.ctaUrl);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      className="absolute left-0 right-0 top-0 z-20">
      <Pressable
        accessibilityRole="button"
        disabled={!announcement.ctaUrl}
        onPress={openCta}
        style={{
          minHeight: insets.top + 68,
          paddingTop: insets.top + 10,
        }}
        className="border-b border-green-500 bg-green-600 px-5 pb-3 active:opacity-90">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-bold text-white" numberOfLines={1}>
              {announcement.title}
            </Text>
            <Text className="mt-0.5 text-sm font-medium leading-5 text-green-100" numberOfLines={1}>
              {announcement.message}
            </Text>
          </View>
          {announcement.dismissible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss announcement"
              hitSlop={12}
              onPress={() => {
                playHaptic('selection');
                onDismiss(announcement.id);
              }}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={24} color="#ffffff" />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
