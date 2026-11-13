import { Redirect, Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { QueryErrorState } from '@/components/QueryErrorState';
import { useAuth } from '@/utils/auth-context';
import { campusSessions } from '@/utils/campus-session';
import { clearAuth } from '@/utils/storage';
import { useExpirePinnedTerm } from '@/hooks/use-ic';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const nativeSheetOptions = {
  presentation: 'formSheet' as const,
  headerShown: Platform.OS !== 'android',
  headerBackVisible: false,
  sheetAllowedDetents: [0.5, 0.9],
  sheetInitialDetentIndex: 1,
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: '#171717' },
};

export default function ProtectedLayout() {
  const { authStatus, refreshAuth, setAuthStatus } = useAuth();
  const queryClient = useQueryClient();

  const handleLogOut = async () => {
    await clearAuth();
    setAuthStatus('unauthenticated');
    queryClient.clear();
  };

  if ((authStatus === 'error' || authStatus === 'expired') && !campusSessions.get()) {
    return (
      <QueryErrorState
        title="Unable to restore your session"
        message="Your old session could not be transferred. Try again, or sign in to your school."
        onRetry={async () => {
          await refreshAuth();
        }}
        secondaryActionLabel="Sign in again"
        onSecondaryAction={handleLogOut}
      />
    );
  }

  if (authStatus === 'unauthenticated') {
    return <Redirect href="/(auth)/onboarding" />;
  }

  return (
    <>
      <PinnedTermExpiry />
      <ProtectedStack />
    </>
  );
}

function PinnedTermExpiry() {
  useExpirePinnedTerm();
  return null;
}

function ProtectedStack() {
  return (
    <Stack initialRouteName="(tabs)">
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="see-all" options={{ presentation: 'card', headerShown: false }} />
      <Stack.Screen
        name="day-modal"
        options={{ presentation: 'card', headerShown: true, headerBackTitle: 'Dashboard' }}
      />
      <Stack.Screen
        name="assignment-modal"
        options={
          Platform.OS === 'android'
            ? nativeSheetOptions
            : { presentation: 'modal', headerShown: true, headerBackButtonDisplayMode: 'minimal' }
        }
      />

      <Stack.Screen name="(course)" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}
