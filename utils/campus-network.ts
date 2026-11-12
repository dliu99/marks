import { fetch as expoFetch } from 'expo/fetch';
import { createCampusClient, type CampusAuthStatus } from '../shared/campus-client';
import { campusSessions } from './campus-session';

const authListeners = new Set<(status: CampusAuthStatus) => void>();
const client = createCampusClient(campusSessions, expoFetch as typeof fetch, (status) => {
  for (const listener of authListeners) listener(status);
});

export const campusFetch = client.request;
export const renewSchoolSession = client.renew;

export function subscribeCampusAuthStatus(listener: (status: CampusAuthStatus) => void) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}
