import { getCampusUser } from '../api/src/shared/campus-user';
import { fetchWithTimeout } from '../api/src/shared/fetch-timeout';
import { fetch as expoFetch } from 'expo/fetch';
import CookieManager from '@preeternal/react-native-cookie-manager';
import {
  campusSessionSchema,
  createCampusTransport,
  getSetCookies,
  mergeCookies,
} from '../api/src/shared/campus-session';
import { registerCampusDevice, verifyCampusUser } from '../shared/campus-auth';
import { campusSessions, initializeCampusStorage } from './campus-session';
import { renewSchoolSession } from './campus-network';
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
  if (campusSessions.get()) return resumeCampusSession();
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
    return resumeCampusSession();
  } catch {
    return 'error';
  }
}

// Opening the app must not depend on reaching the school: a saved login opens the
// app immediately and renews in the background. The campus client reports
// 'expired' if Infinite Campus rejects the renewal, and school requests made in
// the meantime wait for it instead of racing it with old cookies.
function resumeCampusSession(): AuthRefreshStatus {
  renewSchoolSession().catch(() => {});
  return 'authenticated';
}

export async function signOutCampusCookies() {
  await Promise.all([CookieManager.clearAll(), CookieManager.clearAll(true)]);
}
