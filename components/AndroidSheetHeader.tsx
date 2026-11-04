import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

type AndroidSheetHeaderProps = {
  title: string;
  onClose: () => void;
};

export function AndroidSheetHeader({ title, onClose }: AndroidSheetHeaderProps) {
  return (
    <View className="relative min-h-14 flex-row items-center justify-center border-b border-stone-800 px-4">
      <Text className="px-12 text-center text-lg font-semibold text-white" numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        className="absolute right-2 h-11 w-11 items-center justify-center"
        onPress={onClose}>
        <Ionicons name="close" size={27} color="#ffffff" />
      </Pressable>
    </View>
  );
}
