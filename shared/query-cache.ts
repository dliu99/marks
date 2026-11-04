import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

const CACHE_KEY = 'school-cache-v1';
export interface CacheStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

export function restoreQueryCache(client: QueryClient, storage: CacheStorage) {
  const raw = storage.getString(CACHE_KEY);
  if (!raw) return;
  try {
    hydrate(
      client,
      JSON.parse(raw, (_key, value) =>
        value?.__marksMap === true && Array.isArray(value.entries) ? new Map(value.entries) : value
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
        JSON.stringify(state, (_key, value) =>
          value instanceof Map ? { __marksMap: true, entries: [...value] } : value
        )
      );
    } catch {
      /* A full device must not prevent reading data already in memory. */
    }
  });
}
