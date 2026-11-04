import { useEffect, useState } from 'react';
import { Appearance, AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import '@/global.css';
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
  focusManager,
} from '@tanstack/react-query';
import { refreshAuthSession } from '@/utils/storage';
import { refreshCampusSession } from '@/utils/campus-auth';
import { restoreQueryCache, persistQueryCache } from '@/utils/query-persistence';
import { AuthContext, AuthStatus } from '@/utils/auth-context';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 250,
  fade: true,
});

let isRefreshing = false;
let lastRenewalAttemptAt = 0;
let updateAuthStatus: ((status: AuthStatus) => void) | undefined;

async function handle401Error(queryClient: QueryClient) {
  if (isRefreshing || Date.now() - lastRenewalAttemptAt < 30000) return;
  lastRenewalAttemptAt = Date.now();
  isRefreshing = true;
  try {
    const status = await refreshCampusSession();
    if (status === 'expired' || status === 'unauthenticated') updateAuthStatus?.(status);
    if (status === 'authenticated') {
      queryClient.invalidateQueries();
    }
  } finally {
    isRefreshing = false;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: Infinity,
      networkMode: 'always',
      retry: (failureCount, error: any) => {
        if ([0, 401, 403, 503].includes(error?.status)) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
  queryCache: new QueryCache({
    onError: async (error: any) => {
      if (error?.status === 401) {
        await handle401Error(queryClient);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: async (error: any) => {
      if (error?.status === 401) {
        await handle401Error(queryClient);
      }
    },
  }),
});

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();

function ResetAnalyticsOnSignOut({ authStatus }: { authStatus: AuthStatus }) {
  const posthog = usePostHog();
  useEffect(() => {
    if (authStatus === 'unauthenticated') posthog.reset();
  }, [authStatus, posthog]);
  return null;
}

export default function Layout() {
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unauthenticated');
  const theme = 'dark';

  const refreshAuth = async (): Promise<AuthStatus> => {
    const status = await refreshAuthSession();
    setAuthStatus(status);
    return status;
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (Platform.OS !== 'web') {
        focusManager.setFocused(status === 'active');
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    updateAuthStatus = setAuthStatus;
    let unsubscribe: (() => void) | undefined;
    const bootstrap = async () => {
      try {
        await refreshAuth();
        restoreQueryCache(queryClient);
        unsubscribe = persistQueryCache(queryClient);
      } catch {
        setAuthStatus('error');
      } finally {
        setIsBootstrapped(true);
      }
    };

    void bootstrap();
    return () => {
      updateAuthStatus = undefined;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (isBootstrapped) {
      void SplashScreen.hideAsync();
    }
  }, [isBootstrapped]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(theme);
    }
  }, [theme]);

  if (!isBootstrapped) {
    return null;
  }

  const content = (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ authStatus, refreshAuth, setAuthStatus }}>
        <ThemeProvider value={DarkTheme}>
          <BottomSheetModalProvider>
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
              <Stack.Screen
                name="(auth)/school-select"
                options={{
                  headerShown: true,
                  headerTransparent: true,
                  headerTitle: '',
                  headerTintColor: '#ffffff',
                }}
              />
              <Stack.Screen
                name="(auth)/auth-modal"
                options={{
                  presentation: 'modal',
                  headerShown: true,
                  headerTintColor: '#ffffff',
                  headerStyle: { backgroundColor: '#171717' },
                  contentStyle: { backgroundColor: '#171717' },
                }}
              />
              <Stack.Screen
                name="(protected)"
                options={{ headerShown: false, gestureEnabled: false }}
              />
            </Stack>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {posthogKey ? (
        <PostHogProvider
          apiKey={posthogKey}
          options={{
            host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
            enableSessionReplay: false,
            preloadFeatureFlags: false,
          }}
          autocapture={{ captureScreens: false, captureTouches: true, propsToCapture: [] }}>
          <ResetAnalyticsOnSignOut authStatus={authStatus} />
          {content}
        </PostHogProvider>
      ) : (
        content
      )}
    </GestureHandlerRootView>
  );
}
