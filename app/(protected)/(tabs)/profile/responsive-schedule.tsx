import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import { useGrades, useResponsiveSchedule, useUpdateResponsiveSchedule } from '@/hooks/use-ic';
import { useHeaderHeight } from '@/hooks/use-header-height';
import { QueryErrorState } from '@/components/QueryErrorState';
import { playHaptic } from '@/utils/haptics';
import {
  useBottomContentPadding,
  useTransparentHeaderContentPadding,
} from '@/utils/screen-spacing';

// IC's hour-only offset ("-07") is rejected by Date, and these are school
// calendar days, so parse just the date part.
function parseSessionDate(value: string) {
  return dayjs(String(value).slice(0, 10));
}

function formatSessionDate(startDate: string, endDate: string) {
  const start = parseSessionDate(startDate);
  const end = parseSessionDate(endDate);

  if (!start.isValid()) return 'Unknown date';
  if (!end.isValid() || start.isSame(end, 'day')) {
    return start.format('MMM D, YYYY');
  }
  return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
}

export default function ResponsiveSchedule() {
  const { data: grades } = useGrades();
  const sectionID = grades?.[0]?.sectionID;
  const calendarID = grades?.[0]?.calendarID;
  const structureID = grades?.[0]?.structureID;
  const {
    data: loadedSessions,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useResponsiveSchedule(sectionID, calendarID, structureID);
  // Offerings and seat counts come only from the latest successful request.
  const sessions = error ? undefined : loadedSessions;
  const updateMutation = useUpdateResponsiveSchedule();
  const [query, setQuery] = useState('');
  const [mutatingOfferingId, setMutatingOfferingId] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const headerHeight = useHeaderHeight();
  const contentTopPadding = useTransparentHeaderContentPadding(0);
  const contentBottomPadding = useBottomContentPadding(24, { includesNativeTabBar: true });

  useEffect(() => {
    if (!sessions?.length) {
      setSelectedSessionId(null);
      return;
    }

    setSelectedSessionId((currentId) => {
      if (currentId && sessions.some((session) => session.responsiveSessionID === currentId)) {
        return currentId;
      }

      return sessions[0].responsiveSessionID;
    });
  }, [sessions]);

  useEffect(() => {
    setQuery('');
  }, [selectedSessionId]);

  const selectedSession = useMemo(() => {
    if (!sessions?.length) return null;
    return (
      sessions.find((session) => session.responsiveSessionID === selectedSessionId) ?? sessions[0]
    );
  }, [sessions, selectedSessionId]);
  const sessionActions = useMemo(
    () =>
      (sessions || []).map((session) => ({
        id: session.responsiveSessionID.toString(),
        title: session.sessionName,
        subtitle: formatSessionDate(session.startDate, session.endDate),
      })),
    [sessions]
  );

  const filteredOfferings = useMemo(() => {
    if (!selectedSession) return [];
    const normalizedQuery = query.trim().toLowerCase();

    return (selectedSession.offerings || [])
      .filter((offering) => {
        const teacher = offering.teacherDisplay?.toLowerCase() || '';
        const name = offering.responsiveOfferingName?.toLowerCase() || '';
        return (
          normalizedQuery.length === 0 ||
          teacher.includes(normalizedQuery) ||
          name.includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const savedDifference = Number(b.rosterID !== 0) - Number(a.rosterID !== 0);
        if (savedDifference !== 0) return savedDifference;

        return b.currentStudents - a.currentStudents;
      });
  }, [selectedSession, query]);

  if (!sectionID) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-neutral-900"
        edges={['top']}
        style={{ paddingTop: headerHeight }}>
        <Text className="text-lg text-white">No course data available yet.</Text>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-900" edges={['top']}>
        <ActivityIndicator size="large" color="#fff" />
      </SafeAreaView>
    );
  }

  const isEmpty = sessions && sessions.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-neutral-900" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: contentTopPadding,
          paddingBottom: contentBottomPadding,
          paddingHorizontal: 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor="white"
            title="Refreshing..."
            titleColor="white"
          />
        }>
        {error ? (
          <QueryErrorState
            variant="inline"
            error={error}
            subject="responsive schedule"
            onRetry={async () => {
              await refetch();
            }}
            retrying={isFetching}
          />
        ) : null}

        {isEmpty && (
          <View className="flex-1 items-center justify-center">
            <Text className="text-xl font-medium text-white">
              No responsive schedules available
            </Text>
          </View>
        )}

        {selectedSession && (
          <View key={selectedSession.responsiveSessionID} className="mb-4">
            <MenuView
              actions={sessionActions}
              shouldOpenOnLongPress={false}
              onPressAction={({ nativeEvent }) => {
                playHaptic('selection');
                setSelectedSessionId(Number(nativeEvent.event));
              }}>
              <Pressable className="rounded-2xl border border-stone-700 bg-stone-900 px-4 py-4">
                <Text className="text-3xl font-bold text-white">{selectedSession.sessionName}</Text>
              </Pressable>
            </MenuView>
            <Text className="mb-3 mt-1 text-xl font-semibold text-stone-500">
              {formatSessionDate(selectedSession.startDate, selectedSession.endDate)} ·{' '}
              {selectedSession.sessionOpen ? 'Open' : 'Closed'}
            </Text>
            {!isEmpty && sessions && sessions.length > 0 && (
              <TextInput
                className="mb-4 rounded-2xl bg-stone-800 p-4 text-base tracking-wide text-white"
                placeholder="Search by teacher or class"
                placeholderTextColor="#78716c"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            {filteredOfferings.map((offering) => {
              const isFull =
                offering.maxStudents > 0 && offering.currentStudents >= offering.maxStudents;
              const isPending = mutatingOfferingId === offering.responsiveOfferingID;
              const isSaved = offering.rosterID !== 0;

              const handlePress = async () => {
                playHaptic('selection');
                setMutatingOfferingId(offering.responsiveOfferingID);
                try {
                  await updateMutation.mutateAsync({
                    responsiveOfferingID: offering.responsiveOfferingID,
                    calendarID: calendarID!,
                    responsiveSessionID: selectedSession.responsiveSessionID,
                  });
                  playHaptic('success');
                  await refetch();
                } catch (error) {
                  playHaptic('error');
                  console.error('Failed to update responsive schedule', error);
                } finally {
                  setMutatingOfferingId(null);
                }
              };

              let bgClass = '';
              if (isPending) {
                bgClass = 'bg-stone-600';
              } else if (isSaved) {
                bgClass = ''; //'bg-green-900/50'
              }

              return (
                <Pressable
                  key={offering.responsiveOfferingID}
                  onPress={handlePress}
                  disabled={isPending || isSaved}
                  className={`mb-3 rounded-xl p-2 ${bgClass}`}>
                  <View className="flex-row items-start justify-between">
                    <View className="mr-4 flex-1">
                      <Text
                        className="text-base text-lg font-semibold text-white"
                        numberOfLines={2}>
                        {offering.responsiveOfferingName}
                      </Text>
                      {offering.description && (
                        <Text className="text-sm text-stone-400">{offering.description}</Text>
                      )}
                      <Text className="text-sm text-stone-400">
                        {offering.teacherDisplay} · Room {offering.roomName || 'TBD'}
                        <Text className={`text-${isSaved ? 'green-400' : 'stone-400'}`}>
                          {isSaved ? ` · Saved` : ''}
                        </Text>
                      </Text>
                    </View>

                    <View className="items-end">
                      <Text
                        className={`text-lg font-medium ${isFull ? 'text-rose-400' : 'text-green-400'}`}>
                        {offering.currentStudents}/{offering.maxStudents}
                      </Text>
                      {isPending && (
                        <ActivityIndicator size="small" color="#9ca3af" className="mt-1" />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {!isEmpty && filteredOfferings.length === 0 && query.length > 0 && (
          <View className="flex-1 items-center justify-center pt-10">
            <Text className="text-base text-stone-400">No results for &quot;{query}&quot;</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
