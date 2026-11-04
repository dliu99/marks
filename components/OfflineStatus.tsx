import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/utils/auth-context';

export function OfflineStatus() {
  const client = useQueryClient();
  const { authStatus } = useAuth();
  const snapshot = useSyncExternalStore(
    (listener) => client.getQueryCache().subscribe(listener),
    () => {
      const queries = client.getQueryCache().findAll({ queryKey: ['ic'] });
      const failedQueries = queries.filter(
        (query) => query.state.error && query.state.data !== undefined
      );
      const failed = failedQueries.length > 0;
      const timestamps = (failed ? failedQueries : queries)
        .map((query) => query.state.dataUpdatedAt)
        .filter((value) => value > 0);
      const updated = timestamps.length ? Math.min(...timestamps) : 0;
      return `${failed}|${updated}`;
    }
  );
  const [failed, updated] = snapshot.split('|');
  const expired = authStatus === 'expired';
  if (failed !== 'true' && !expired) return null;
  return (
    <View style={{ padding: 12, marginBottom: 16, borderRadius: 12, backgroundColor: '#292524' }}>
      <Text style={{ color: '#fafaf9', fontSize: 13 }} accessibilityLiveRegion="polite">
        {expired
          ? 'Sign in again to update your school data.'
          : 'Unable to refresh. Showing saved school data.'}
        {Number(updated) > 0 ? ` Last updated ${new Date(Number(updated)).toLocaleString()}.` : ''}
      </Text>
      {expired ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/school-select')}>
          <Text style={{ color: '#93c5fd', paddingTop: 8 }}>Sign in again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
