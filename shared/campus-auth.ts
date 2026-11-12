import { getCampusUser } from '../api/src/shared/campus-user';
import {
  campusSessionSchema,
  CampusError,
  type CampusSession,
} from '../api/src/shared/campus-session';

export async function registerCampusDevice(
  session: CampusSession,
  request: typeof fetch
): Promise<void> {
  const response = await request(`https://${session.baseURL}/api/campus/hybridDevice/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registrationToken: 'marks',
      deviceType: session.deviceType,
      deviceModel: `marks/${session.deviceModel}`,
      appVersion: '1.11.4',
      systemVersion: session.systemVersion,
      deviceID: session.deviceId,
      keepMeLoggedIn: true,
    }),
  });
  if (!response.ok) throw new CampusError('Unable to renew your school session.', response.status);
}

export async function verifyCampusUser(session: CampusSession, request: typeof fetch) {
  const user = await getCampusUser(session.baseURL, request);
  if (user.userID !== session.userID || user.personID !== session.personID) {
    throw new CampusError('Please sign in to your school again.', 401);
  }
  return user;
}

export async function renewCampusSession(session: CampusSession, request: typeof fetch) {
  campusSessionSchema.parse(session);
  const appName = session.cookie.match(/(?:^|;\s*)appName=([^;]+)/)?.[1];
  if (!appName) throw new CampusError('Please sign in to your school again.', 401);
  const response = await request(`https://${session.baseURL}/mobile/hybridAppUtil.jsp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    body: new URLSearchParams({
      appName,
      deviceID: session.deviceId,
      deviceModel: session.deviceModel,
      deviceType: session.deviceType,
      systemVersion: session.systemVersion,
      appType: 'student',
      appVersion: '1.11.4',
      bootstrapped: '1',
      registrationToken: 'null',
    }).toString(),
  });
  // IC redirects here when it no longer accepts the saved "keep me logged in" cookie
  // (signed out elsewhere, password change, district policy). Only signing in fixes it.
  if (/persistentCookieRevoked/i.test(response.headers.get('location') ?? '')) {
    throw new CampusError('Your school login expired. Please sign in again.', 401);
  }
  if (!response.ok && response.status !== 302 && response.status !== 303) {
    throw new CampusError('Unable to renew your school session.', response.status);
  }
  try {
    await registerCampusDevice(session, request);
  } catch (error) {
    // IC answers 403 on /api/ when the bootstrap did not produce a signed-in session.
    if (error instanceof CampusError && error.status === 403) {
      throw new CampusError('Your school login expired. Please sign in again.', 401);
    }
    throw error;
  }
  await verifyCampusUser(session, request);
}
