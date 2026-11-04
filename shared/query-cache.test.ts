// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { persistQueryCache, restoreQueryCache } from './query-cache';

function memoryStorage() {
  const values = new Map();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}
function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

describe('saved school data', () => {
  test('restores course details Maps and last-update timestamps after a process restart', () => {
    const storage = memoryStorage();
    const before = client();
    const unsubscribe = persistQueryCache(before, storage, () => true);
    const data = {
      courses: [{ sectionID: 1 }],
      detailsMap: new Map([[1, { task: { sectionID: 1 } }]]),
    };
    before.setQueryData(['ic', 'allGradesWithDetails', null, null], data, { updatedAt: 123456 });
    const after = client();
    restoreQueryCache(after, storage);
    const restored = after.getQueryData(['ic', 'allGradesWithDetails', null, null]);
    expect(restored.detailsMap).toBeInstanceOf(Map);
    expect(restored.detailsMap.get(1).task.sectionID).toBe(1);
    expect(after.getQueryState(['ic', 'allGradesWithDetails', null, null]).dataUpdatedAt).toBe(
      123456
    );
    unsubscribe();
    before.clear();
    after.clear();
  });
  test('a failed offline refresh preserves the previous durable data', async () => {
    const storage = memoryStorage();
    const before = client();
    const unsubscribe = persistQueryCache(before, storage, () => true);
    before.setQueryData(['ic', 'grades'], [{ sectionID: 1 }]);
    await expect(
      before.fetchQuery({
        queryKey: ['ic', 'grades'],
        queryFn: async () => {
          throw new Error('Offline');
        },
      })
    ).rejects.toThrow('Offline');
    expect(before.getQueryData(['ic', 'grades'])).toEqual([{ sectionID: 1 }]);
    const after = client();
    restoreQueryCache(after, storage);
    expect(after.getQueryData(['ic', 'grades'])).toEqual([{ sectionID: 1 }]);
    unsubscribe();
    before.clear();
    after.clear();
  });
  test('does not persist credentials, mutations, or unrelated queries', () => {
    const storage = memoryStorage();
    const before = client();
    const unsubscribe = persistQueryCache(before, storage, () => true);
    before.setQueryData(['secret'], { cookie: 'do-not-store' });
    before.setQueryData(['ic', 'grades'], []);
    expect(storage.getString('school-cache-v1')).not.toContain('do-not-store');
    const after = client();
    restoreQueryCache(after, storage);
    expect(after.getQueryData(['secret'])).toBeUndefined();
    unsubscribe();
    before.clear();
    after.clear();
  });
  test('late results after sign-out do not repopulate durable data', () => {
    const storage = memoryStorage();
    const before = client();
    let hasSession = true;
    const unsubscribe = persistQueryCache(before, storage, () => hasSession);
    before.setQueryData(['ic', 'grades'], [1]);
    storage.clear();
    hasSession = false;
    before.setQueryData(['ic', 'grades'], [2]);
    expect(storage.getString('school-cache-v1')).toBeUndefined();
    unsubscribe();
    before.clear();
  });
  test('corrupt data is removed without preventing startup', () => {
    const storage = memoryStorage();
    storage.set('school-cache-v1', '{bad-json');
    const after = client();
    restoreQueryCache(after, storage);
    expect(storage.getString('school-cache-v1')).toBeUndefined();
    after.clear();
  });
});
