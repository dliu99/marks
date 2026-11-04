import { Stack, useRouter } from 'expo-router';
import { useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { playHaptic } from '@/utils/haptics';

const sentences = [
  ' stay on top of every assignment',
  ' see your grades at a glance',
  ' handle responsive schedules with ease',
  ' keep everything organized in one place',
];

const CYCLE_DURATION = 2200;
const FADE_DURATION = 300;

export default function Home() {
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const router = useRouter();

  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(12);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(24);

  const sentenceOpacity = useSharedValue(1);

  useEffect(() => {
    titleOpacity.value = withDelay(200, withTiming(1, { duration: 700 }));
    titleTranslateY.value = withDelay(
      200,
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) })
    );

    subtitleOpacity.value = withDelay(500, withTiming(1, { duration: 700 }));
    subtitleTranslateY.value = withDelay(
      500,
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) })
    );

    buttonOpacity.value = withDelay(800, withTiming(1, { duration: 700 }));
    buttonTranslateY.value = withDelay(
      800,
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
  }, [
    buttonOpacity,
    buttonTranslateY,
    subtitleOpacity,
    subtitleTranslateY,
    titleOpacity,
    titleTranslateY,
  ]);

  const advanceSentence = useCallback(() => {
    setSentenceIndex((prev) => (prev + 1) % sentences.length);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      sentenceOpacity.value = withTiming(0, { duration: FADE_DURATION });

      const resetTimeout = setTimeout(() => {
        runOnJS(advanceSentence)();
        sentenceOpacity.value = withTiming(1, { duration: FADE_DURATION });
      }, FADE_DURATION + 50);

      return () => clearTimeout(resetTimeout);
    }, CYCLE_DURATION);

    return () => clearInterval(interval);
  }, [advanceSentence, sentenceOpacity]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const sentenceStyle = useAnimatedStyle(() => ({
    opacity: sentenceOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  return (
    <SafeAreaView className="flex flex-1 bg-neutral-900">
      <Stack.Screen options={{ title: 'Home' }} />
      <View className="flex w-full flex-1 items-center justify-between px-6 pb-12 pt-16">
        <View className="w-full flex-1 items-center justify-center">
          <View className="w-80 items-center px-4">
            <Animated.Text style={titleStyle} className="text-center text-2xl font-bold text-white">
              marks 📈 helps you
            </Animated.Text>
            <Animated.Text
              style={[subtitleStyle, sentenceStyle, { minHeight: 48, textAlign: 'center' }]}
              className="text-2xl font-bold leading-snug text-white">
              {sentences[sentenceIndex]}
            </Animated.Text>
          </View>
        </View>
        <Animated.View style={buttonStyle} className="w-full items-center">
          <Pressable
            onPress={() => {
              playHaptic('navigation');
              router.push('/school-select');
            }}
            className="h-16 w-full items-center justify-center rounded-xl bg-slate-100 p-4 active:opacity-80">
            <Text className="text-center text-lg font-semibold text-slate-950">
              Sign in with Infinite Campus
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
