import { Link } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useBottomContentPadding,
  useTransparentHeaderContentPadding,
} from '@/utils/screen-spacing';

export default function About() {
  const paddingTop = useTransparentHeaderContentPadding(24);
  const paddingBottom = useBottomContentPadding(32, { includesNativeTabBar: true });
  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']}>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingTop, paddingBottom }}>
        <Text className="mb-4 text-lg text-stone-300">
          Marks connects directly to your school. Your school session and saved grades are encrypted
          on this device. New sign-ins do not store your session on a Marks server.
        </Text>
        <Text className="mb-4 text-lg text-stone-300">
          {process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim()
            ? 'This build uses PostHog for anonymous interaction analytics. Session replay is disabled. School account IDs are not used as analytics identifiers.'
            : 'Analytics is disabled in this build.'}
        </Text>
        <Text className="mb-4 text-lg text-stone-300">
          Saved data stays available when your school is unreachable. Fresh grades and schedule
          changes require an internet connection and a valid school session.
        </Text>
        <Text className="mb-4 text-lg text-stone-300">
          Signing out removes your saved session and school data. You can also revoke your session
          on the Infinite Campus website under User Menu → Current Devices → marks → Log Off.
        </Text>
        <Link href="https://github.com/dliu99/marks/issues" asChild>
          <Text className="mb-4 text-lg text-blue-400 underline">Report an issue</Text>
        </Link>
        <Link href="https://github.com/dliu99/marks/blob/main/LICENSE" asChild>
          <Text className="mb-4 text-lg text-blue-400 underline">Source license</Text>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}
