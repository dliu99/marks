import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

const CACHE_KEY = 'school-cache-v1';
export interface CacheStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

// The saved cache records school data, not failed fetches. A persisted error
// would be restored on every launch and keep reporting a failed refresh until
// that exact query (a closed course, an old term) happened to be fetched again.
function withoutErrors(state: DehydratedState): DehydratedState {
  return {
    ...state,
    queries: state.queries.map((query) => ({
      ...query,
      state: {
        ...query.state,
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        status: query.state.data === undefined ? query.state.status : 'success',
      },
    })),
  };
}

export function restoreQueryCache(client: QueryClient, storage: CacheStorage) {
  const raw = storage.getString(CACHE_KEY);
  if (!raw) return;
  try {
    // Caches saved by earlier builds may still contain errors; drop them too.
    hydrate(
      client,
      withoutErrors(
        JSON.parse(raw, (_key, value) =>
          value?.__marksMap === true && Array.isArray(value.entries)
            ? new Map(value.entries)
            : value
        )
      )
    );
  } catch {
    storage.remove(CACHE_KEY);
  }
}

export function persistQueryCache(
  client: QueryClient,
  storage: CacheStorage,
  hasSession: () => boolean
) {
  return client.getQueryCache().subscribe((event) => {
    if (!hasSession() || event.type !== 'updated' || event.action.type !== 'success') return;
    const state = dehydrate(client, {
      shouldDehydrateQuery: (query) => query.queryKey[0] === 'ic' && query.state.data !== undefined,
      shouldDehydrateMutation: () => false,
    });
    try {
      storage.set(
        CACHE_KEY,
        JSON.stringify(withoutErrors(state), (_key, value) =>
          value instanceof Map ? { __marksMap: true, entries: [...value] } : value
        )
      );
    } catch {
      /* A full device must not prevent reading data already in memory. */
    }
  });
}

// What the saved-data banner describes: school data the current screens are
// showing. Inactive queries never refetch, so their last error would otherwise
// keep the banner up after everything on screen has refreshed successfully.
export function getVisibleSchoolDataStatus(client: QueryClient) {
  const queries = client.getQueryCache().findAll({ queryKey: ['ic'], type: 'active' });
  const failed = queries.filter((query) => query.state.error && query.state.data !== undefined);
  const timestamps = (failed.length ? failed : queries)
    .map((query) => query.state.dataUpdatedAt)
    .filter((value) => value > 0);
  return { failed: failed.length > 0, updatedAt: timestamps.length ? Math.min(...timestamps) : 0 };
}
