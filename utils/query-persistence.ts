import type { QueryClient } from '@tanstack/react-query';
import { restoreQueryCache as restore, persistQueryCache as persist } from '../shared/query-cache';
import { campusSessions, getPrivateStorage } from './campus-session';

export function restoreQueryCache(client: QueryClient) {
  if (campusSessions.get()) restore(client, getPrivateStorage());
}
export function persistQueryCache(client: QueryClient) {
  return persist(client, getPrivateStorage(), () => campusSessions.get() !== null);
}
