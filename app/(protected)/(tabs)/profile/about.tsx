import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { playHaptic } from '@/utils/haptics';
import { getAuthSession } from '@/utils/storage';
import {
  useBottomContentPadding,
  useTransparentHeaderContentPadding,
} from '@/utils/screen-spacing';

const colors = {
  sheet: '#171717',
  border: '#44403c',
  label: '#f5f5f4',
  tertiaryLabel: '#78716c',
};

export default function About() {
  const insets = useSafeAreaInsets();
  const feedbackSheetRef = useRef<BottomSheetModal>(null);
  const [feedback, setFeedback] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const contentTopPadding = useTransparentHeaderContentPadding(24);
  const contentBottomPadding = useBottomContentPadding(32, { includesNativeTabBar: true });

  const renderContainer = useCallback(
    (props: { children?: ReactNode }) => <FullWindowOverlay>{props.children}</FullWindowOverlay>,
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

  const closeFeedbackSheet = useCallback(() => {
    Keyboard.dismiss();
    feedbackSheetRef.current?.dismiss();
  }, []);

  async function handleSendFeedback() {
    const message = feedback.trim();
    if (!message) {
      playHaptic('warning');
      Alert.alert('Feedback required', 'Add a note before sending feedback.');
      return;
    }

    setFeedbackSending(true);
    try {
      const session = getAuthSession();
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL!}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          uuid: session?.uuid,
          name: trimmedName || undefined,
          email: trimmedEmail || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to send feedback right now.');
      }

      playHaptic('success');
      setFeedback('');
      setName('');
      setEmail('');
      closeFeedbackSheet();
      Alert.alert('Feedback sent', 'Thanks for helping improve marks.');
    } catch {
      playHaptic('error');
      Alert.alert('Unable to send feedback', 'Try again in a bit.');
    } finally {
      setFeedbackSending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{
          paddingTop: contentTopPadding,
          paddingBottom: contentBottomPadding,
        }}
        keyboardShouldPersistTaps="handled">
        <View>
          <Text className="mb-4 text-lg text-stone-300">
            marks is being removed off the App Store by Infinite Campus. If you/your agent wants to
            explore the source code, marks is open source{' '}
            <Link asChild href="https://github.com/dliu99/marks">
              <Text className="text-lg text-blue-400 underline">here</Text>
            </Link>
          </Text>
          <Text className="text-lg text-stone-300">
            Enjoying marks? Contact{' '}
            <Link asChild href="https://devinliu.xyz">
              <Text className="text-lg text-blue-400 underline">me</Text>
            </Link>{' '}
            via{' '}
            <Link asChild href="mailto:devin78988@gmail.com?subject=Yo">
              <Text className="text-lg text-blue-400 underline">email</Text>
            </Link>{' '}
            if you have any feedback or suggestions!
          </Text>
          <Link asChild href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">
            <Text className="text-lg leading-8 text-blue-400 underline">Terms and Conditions</Text>
          </Link>
          <Link
            asChild
            href="https://puffy-hornet-023.notion.site/Privacy-Policy-33e147997ae480fdb946c6a09fa01e1e">
            <Text className="text-lg leading-8 text-blue-400 underline">Privacy Policy*</Text>
          </Link>
          <Text className="text-md text-stone-300">
            *Your Infinite Campus session data is encrypted via iron-webcrypto and stored locally on
            your device. We log no information about you, not even your name.
          </Text>
          <Text />
          <Text className="text-md text-stone-300">
            You can permanently remove your session via the official Infinite Campus website/User
            Menu/Current Devices/Select &quot;marks&quot;/Log Off
          </Text>

          <Pressable
            onPress={() => {
              playHaptic('navigation');
              feedbackSheetRef.current?.present();
            }}
            className="mt-6 rounded-2xl border border-stone-700 p-5 active:scale-[0.97] active:opacity-80">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-semibold text-white">Send Feedback</Text>
              <Ionicons name="arrow-forward" size={24} color="#ffffff" />
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={feedbackSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        detached
        enableOverDrag={false}
        android_keyboardInputMode="adjustResize"
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backdropComponent={renderBackdrop}
        containerComponent={Platform.OS === 'ios' ? renderContainer : undefined}
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
            <Text className="text-2xl font-bold tracking-[-0.6px] text-stone-100">
              Send Feedback
            </Text>
            <BottomSheetTextInput
              value={feedback}
              onChangeText={setFeedback}
              multiline
              autoCapitalize="none"
              textAlignVertical="top"
              maxLength={4000}
              placeholder="What should be improved?"
              placeholderTextColor={colors.tertiaryLabel}
              style={{
                borderColor: colors.border,
                borderRadius: 18,
                borderWidth: 1,
                color: colors.label,
                fontSize: 17,
                minHeight: 132,
                padding: 14,
              }}
              editable={!feedbackSending}
            />
            <BottomSheetTextInput
              value={name}
              onChangeText={setName}
              autoCapitalize="none"
              maxLength={120}
              placeholder="Name (optional)"
              placeholderTextColor={colors.tertiaryLabel}
              style={{
                borderColor: colors.border,
                borderRadius: 18,
                borderWidth: 1,
                color: colors.label,
                fontSize: 17,
                minHeight: 52,
                padding: 14,
              }}
              editable={!feedbackSending}
            />
            <BottomSheetTextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              keyboardType="email-address"
              maxLength={254}
              placeholder="Email (optional)"
              placeholderTextColor={colors.tertiaryLabel}
              style={{
                borderColor: colors.border,
                borderRadius: 18,
                borderWidth: 1,
                color: colors.label,
                fontSize: 17,
                minHeight: 52,
                padding: 14,
              }}
              editable={!feedbackSending}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleSendFeedback}
              className="min-h-[56px] items-center justify-center rounded-[18px] bg-[#0A84FF] active:bg-[#409CFF]"
              disabled={feedbackSending}
              style={{ opacity: feedbackSending ? 0.6 : 1 }}>
              {feedbackSending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-[17px] font-bold tracking-[-0.2px] text-white">Send</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                playHaptic('selection');
                closeFeedbackSheet();
              }}
              className="min-h-[52px] items-center justify-center rounded-[18px] bg-[#292524] active:bg-[#1c1917]"
              disabled={feedbackSending}>
              <Text className="text-[17px] font-bold tracking-[-0.2px] text-stone-400">Cancel</Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
