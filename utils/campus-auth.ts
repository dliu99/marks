import { getCampusUser } from '../api/src/shared/campus-user';
import { fetchWithTimeout } from '../api/src/shared/fetch-timeout';
import { fetch as expoFetch } from 'expo/fetch';
import CookieManager from '@preeternal/react-native-cookie-manager';
import {
  campusSessionSchema,
  createCampusTransport,
  getSetCookies,
  mergeCookies,
  CampusError,
} from '../api/src/shared/campus-session';
import { registerCampusDevice, renewCampusSession, verifyCampusUser } from '../shared/campus-auth';
import { campusSessions, initializeCampusStorage } from './campus-session';
import { campusFetch } from './campus-network';
import { getAuthSession, storage, type AuthRefreshStatus } from './storage';
import type { CampusSession } from '../api/src/shared/campus-session';

export async function finishCampusLogin(input: Omit<CampusSession, 'userID' | 'personID'>) {
  await initializeCampusStorage();
  const url = new URL(`https://${input.baseURL}`);
  if (input.baseURL !== `${url.hostname}/campus`) throw new Error('Invalid district address.');
  // The WebView has already authenticated; identify the account before persisting it.
  let cookie = input.cookie;
  const loginRequest: typeof fetch = async (target, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Cookie', cookie);
    const response = await fetchWithTimeout(expoFetch as typeof fetch, target, {
      ...init,
      headers,
      credentials: 'omit',
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, getSetCookies(response.headers));
    return response;
  };
  const user = await getCampusUser(input.baseURL, loginRequest);
  const next = campusSessionSchema.parse({
    ...input,
    cookie,
    userID: user.userID,
    personID: user.personID,
  });
  // Complete login in isolation so a failed attempt cannot destroy the previous account.
  let candidate = {
    ...next,
    cookie: mergeCookies(next.cookie, [
      'appType=student',
      'campus_hybrid_app=student',
      `deviceID=${input.deviceId}`,
    ]),
  };
  const candidateRequest = createCampusTransport(
    {
      get: () => candidate,
      save: (value) => {
        candidate = value;
      },
    },
    expoFetch as typeof fetch
  );
  await registerCampusDevice(candidate, candidateRequest);
  await verifyCampusUser(candidate, candidateRequest);
  const { clearCampusSession } = await import('./campus-session');
  clearCampusSession();
  campusSessions.save(candidate);
  storage.remove('uuid');
  storage.remove('sessionToken');
}

export async function restoreCampusSession(): Promise<AuthRefreshStatus> {
  await initializeCampusStorage();
  if (campusSessions.get()) return 'authenticated';
  const legacy = getAuthSession();
  if (!legacy) return 'unauthenticated';
  const apiURL = process.env.EXPO_PUBLIC_API_URL;
  if (!apiURL) return 'expired';
  try {
    const response = await fetchWithTimeout(
      expoFetch as typeof fetch,
      `${apiURL}/auth/migrate-session`,
      {
        method: 'POST',
        headers: { Authorization: legacy.sessionToken },
      },
      15000
    );
    if (response.status === 401 || response.status === 404) return 'expired';
    if (!response.ok) return 'error';
    const { session } = (await response.json()) as { session: unknown };
    campusSessions.save(campusSessionSchema.parse(session));
    storage.remove('uuid');
    storage.remove('sessionToken');
    return 'authenticated';
  } catch {
    return 'error';
  }
}

let renewal: Promise<AuthRefreshStatus> | null = null;
export function refreshCampusSession(): Promise<AuthRefreshStatus> {
  if (renewal) return renewal;
  renewal = (async (): Promise<AuthRefreshStatus> => {
    const session = campusSessions.get();
    if (!session) return 'unauthenticated';
    try {
      await renewCampusSession(session, campusFetch);
      return 'authenticated';
    } catch (error) {
      return error instanceof CampusError && error.status === 401 ? 'expired' : 'error';
    }
  })().finally(() => {
    renewal = null;
  });
  return renewal;
}

export async function signOutCampusCookies() {
  await Promise.all([CookieManager.clearAll(), CookieManager.clearAll(true)]);
}
