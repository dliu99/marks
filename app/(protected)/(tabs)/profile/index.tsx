import { QueryErrorState } from '@/components/QueryErrorState';
import { pickSchoolError } from '@/utils/school-error';
import { View, Text, Pressable, Alert, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser, useProfile, useAppList } from '@/hooks/use-ic';
import { App, AppTool } from '@/api/src/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { clearAuth } from '@/utils/storage';
import { useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { maybeRequestReview } from '@/utils/store-review';
import { playHaptic } from '@/utils/haptics';
import { useAuth } from '@/utils/auth-context';
import { useBottomContentPadding } from '@/utils/screen-spacing';

function ProfileCard({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="flex-1 rounded-2xl border border-stone-700 p-5">
      <Text className="text-4xl font-bold text-white">{value ?? '—'}</Text>
      <Text className="mt-2 text-base text-stone-500">{label}</Text>
    </View>
  );
}

export default function Profile() {
  const { setAuthStatus } = useAuth();
  const { isLoading: userLoading, error: userError, refetch: refetchUser } = useUser();
  const {
    data: loadedProfile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile();
  const { refetch: refetchAppList, isFetching: appListFetching } = useAppList(false);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const shouldAttemptReviewRef = useRef(true);
  const contentBottomPadding = useBottomContentPadding(24, { includesNativeTabBar: true });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchUser(), refetchProfile()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = () => {
    playHaptic('warning');
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          playHaptic('selection');
          await clearAuth();
          setAuthStatus('unauthenticated');
          queryClient.clear();
          router.replace('/(auth)/onboarding');
        },
      },
    ]);
  };

  const isLoading = userLoading || profileLoading;
  const error = pickSchoolError(userError, profileError);
  // GPA and attendance come only from the latest successful request.
  const profile = error ? undefined : loadedProfile;

  useFocusEffect(() => {
    shouldAttemptReviewRef.current = true;

    return () => {
      shouldAttemptReviewRef.current = false;
    };
  });

  useEffect(() => {
    if (!shouldAttemptReviewRef.current || userLoading || profileLoading) {
      return;
    }

    shouldAttemptReviewRef.current = false;
    void maybeRequestReview('profile-retry');
  }, [userLoading, profileLoading]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']} collapsable={false}>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: 48,
          paddingBottom: contentBottomPadding,
          paddingHorizontal: 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="white"
            title="Refreshing..."
            titleColor="white"
            progressBackgroundColor="white"
          />
        }>
        <Text className="mb-6 text-3xl font-bold text-white">Profile</Text>
        {error ? (
          <QueryErrorState
            variant="inline"
            error={error}
            subject="GPA and attendance"
            onRetry={onRefresh}
            retrying={refreshing}
          />
        ) : isLoading ? (
          <Text className="mb-4 text-stone-400">Updating profile…</Text>
        ) : null}

        {profile?.gpa && (
          <View className="mb-4 flex-row gap-4">
            <ProfileCard label="Unweighted GPA" value={profile.gpa.uw} />
            <ProfileCard label="Weighted GPA" value={profile.gpa.w} />
          </View>
        )}
        {profile && profile.absences !== null && profile.tardies !== null && (
          <View className="mb-4 flex-row gap-4">
            <ProfileCard label="Absences" value={profile?.absences?.toString() ?? '—'} />
            <ProfileCard label="Tardies" value={profile?.tardies?.toString() ?? '—'} />
          </View>
        )}
        <Pressable
          onPress={() => {
            playHaptic('navigation');
            router.push('/(protected)/(tabs)/profile/about');
          }}
          className="mb-4 rounded-2xl border border-stone-700 p-5 active:scale-[0.97] active:opacity-80">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-white">About marks 📈</Text>
            <Ionicons name="arrow-forward" size={24} color="#ffffff" />
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            playHaptic('navigation');
            router.push('/(protected)/(tabs)/profile/preferences');
          }}
          className="mb-4 rounded-2xl border border-stone-700 p-5 active:scale-[0.97] active:opacity-80">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-white">Preferences</Text>
            <Ionicons name="arrow-forward" size={24} color="#ffffff" />
          </View>
        </Pressable>

        <Pressable
          onPress={async () => {
            try {
              const result = await refetchAppList();
              const appListArray: App[] | undefined = result.data;
              const hasResponsiveSchedule = appListArray?.some((app: App) =>
                app.tools?.some(
                  (tool: AppTool) => tool.code === 'student.responsive-schedule' && tool.display
                )
              );
              if (hasResponsiveSchedule) {
                playHaptic('navigation');
                router.push('/(protected)/(tabs)/profile/responsive-schedule');
              } else {
                playHaptic('warning');
                Alert.alert(
                  'Not available',
                  'Responsive scheduling is not available for your account.'
                );
              }
            } catch {
              playHaptic('error');
              Alert.alert('Error', 'Unable to check responsive scheduling right now.');
            }
          }}
          className="mb-4 rounded-2xl border border-stone-700 p-5 active:scale-[0.97] active:opacity-80"
          disabled={appListFetching}
          style={{ opacity: appListFetching ? 0.6 : 1 }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-white">Responsive Schedule</Text>
            <Ionicons name="arrow-forward" size={24} color="#ffffff" />
          </View>
        </Pressable>

        <Pressable
          onPress={handleSignOut}
          className="mb-4 rounded-2xl bg-red-900/50 p-5 active:scale-[0.97] active:opacity-80">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-white">Sign Out</Text>
            <Ionicons name="log-out-outline" size={24} color="#fca5a5" />
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
