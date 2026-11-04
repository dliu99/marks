import { createSessionMigrationRoutes } from './shared/session-migration';
import { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import * as z from 'zod';
import {
  approveWebPairAttempt,
  consumeWebPairAttempt,
  createWebPairAttempt,
  expireWebPairAttempt,
  getWebPairAttemptForCompletion,
  sealSessionData,
  unsealSessionData,
  createICSession,
  findStoredUserID,
} from './supabase';
import type { Enrollment } from './types';
import { fetchUserAccount } from './user-account';
import { WEB_SESSION_COOKIE_NAME } from './web-session';

const auth = new Hono<{ Bindings: Env }>();
const WEB_PAIR_EXPIRATION_MS = 2 * 60 * 1000;

function mergeCookies(oldCookie: string, setCookieHeaders: string[]): string {
  const cookieMap = new Map<string, string>();

  oldCookie.split(';').forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const [name, ...valueParts] = trimmed.split('=');
    if (name) cookieMap.set(name, valueParts.join('='));
  });

  setCookieHeaders.forEach((header) => {
    const firstPart = header.split(';')[0];
    const [name, ...valueParts] = firstPart.trim().split('=');
    if (name) cookieMap.set(name, valueParts.join('='));
  });

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function getSetCookieHeaders(headers: Headers): string[] {
  const candidate = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof candidate.getSetCookie === 'function') {
    return candidate.getSetCookie();
  }
  const setCookie = headers.get('set-cookie');
  return setCookie ? [setCookie] : [];
}

interface SessionData {
  cookie: string;
  baseURL: string;
  deviceId: string;
  deviceModel: string;
  deviceType: string;
  systemVersion: string;
  userID: number;
  personID: number;
}

type UserIDs = { userID: number; personID: number; firstName?: string; lastName?: string };

/**
 * Read the IC user and person IDs for a cookie. If no account endpoint
 * answers, fall back to the personID IC stamps on grade data; userID is then
 * unknown.
 */
async function fetchUserIDs(
  baseURL: string,
  cookie: string,
  userAgent: string
): Promise<{ ids: Partial<UserIDs>; accountStatus: number }> {
  const { account, status } = await fetchUserAccount(baseURL, cookie, {
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'User-Agent': userAgent,
  });
  if (account) return { ids: account, accountStatus: 200 };
  if (status === 401 || status === 403) return { ids: {}, accountStatus: status };

  const gradesResponse = await fetch(`https://${baseURL}/resources/portal/grades`, {
    headers: { Accept: 'application/json', Cookie: cookie },
  });
  if (!gradesResponse.ok) return { ids: {}, accountStatus: status };

  const enrollments = (await gradesResponse.json().catch(() => [])) as Enrollment[];
  const personID = enrollments
    .flatMap((enrollment) => enrollment.terms || [])
    .flatMap((term) => term.courses || [])
    .flatMap((course) => course.gradingTasks || [])
    .map((task) => (task as { personID?: number }).personID)
    .find((value): value is number => typeof value === 'number');
  return { ids: { personID }, accountStatus: status };
}

function getRandomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function setWebSessionCookie(c: Context<{ Bindings: Env }>, sessionToken: string): void {
  setCookie(c, WEB_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: true,
  });
}

auth.get('/', (c) => {
  return c.json({ ok: true, message: 'Hello Hono!' });
});

auth.get('/districts', async (c) => {
  const state = c.req.query('state');
  const query = c.req.query('query');
  if (!state || !query || query.length < 3) {
    return c.json(
      {
        ok: false,
        message: 'State and query are required and query must be at least 3 characters',
      },
      400
    );
  }
  const params = new URLSearchParams({ state: state.toUpperCase(), query });
  const response = await fetch(`https://www.infinitecampus.com/api/district?${params}`);
  const data = await response.json().catch(() => null);
  // IC returns an error object (not an array) for bad requests.
  if (!response.ok || !Array.isArray(data)) {
    return c.json({ ok: false, message: 'District search failed' }, 502);
  }
  return c.json({ ok: true, data });
});

auth.post('/web-pair/start', async (c) => {
  const attemptId = crypto.randomUUID();
  const approvalToken = getRandomToken();
  const completionToken = getRandomToken();
  const expiresAt = new Date(Date.now() + WEB_PAIR_EXPIRATION_MS).toISOString();
  const created = await createWebPairAttempt(
    attemptId,
    await hashToken(approvalToken),
    await hashToken(completionToken),
    expiresAt
  );

  if (!created) {
    return c.json({ ok: false, message: 'Unable to start web pairing' }, 500);
  }

  return c.json({
    ok: true,
    attemptId,
    approvalToken,
    completionToken,
    expiresAt,
  });
});

auth.post('/web-pair/approve', async (c) => {
  const sessionToken = c.req.header('Authorization');
  if (!sessionToken) {
    return c.json({ ok: false, message: 'Missing mobile session token' }, 401);
  }

  try {
    await unsealSessionData<SessionData>(sessionToken);
  } catch {
    return c.json({ ok: false, message: 'Invalid mobile session token' }, 401);
  }

  const schema = z.object({
    attemptId: z.string().uuid(),
    approvalToken: z.string().min(1),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Invalid web pairing approval' }, 400);
  }

  const approved = await approveWebPairAttempt(
    parsed.data.attemptId,
    await hashToken(parsed.data.approvalToken),
    sessionToken
  );
  if (!approved) {
    return c.json({ ok: false, message: 'Web pairing request is invalid or expired' }, 409);
  }

  return c.json({ ok: true });
});

auth.post('/web-pair/complete', async (c) => {
  const schema = z.object({
    attemptId: z.string().uuid(),
    completionToken: z.string().min(1),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Invalid web pairing completion' }, 400);
  }

  const completionTokenHash = await hashToken(parsed.data.completionToken);
  const attempt = await getWebPairAttemptForCompletion(parsed.data.attemptId, completionTokenHash);
  if (!attempt) {
    return c.json({ ok: false, message: 'Web pairing request was not found' }, 404);
  }

  if (Date.parse(attempt.expiresAt) <= Date.now()) {
    await expireWebPairAttempt(attempt.id);
    return c.json({ ok: false, message: 'Web pairing request expired' }, 410);
  }

  if (attempt.status === 'pending') {
    return c.json({ ok: true, status: 'pending' as const }, 202);
  }

  if (attempt.status !== 'approved' || !attempt.approvedSessionToken) {
    return c.json({ ok: false, message: 'Web pairing request has already been used' }, 409);
  }

  const consumed = await consumeWebPairAttempt(attempt.id, completionTokenHash);
  if (!consumed) {
    return c.json({ ok: false, message: 'Web pairing request has already been used' }, 409);
  }

  setWebSessionCookie(c, attempt.approvedSessionToken);
  return c.json({ ok: true, status: 'paired' as const });
});

auth.post('/web-session/sign-out', (c) => {
  deleteCookie(c, WEB_SESSION_COOKIE_NAME, {
    path: '/',
    secure: true,
  });
  return c.json({ ok: true });
});

auth.route('/', createSessionMigrationRoutes(unsealSessionData));

auth.post('/verify-session', async (c) => {
  const res = await c.req.json().catch(() => ({}));
  const fromCookie = getCookie(c, WEB_SESSION_COOKIE_NAME);
  const sessionToken = res?.sessionToken ?? c.req.header('Authorization') ?? fromCookie;
  if (!sessionToken) {
    return c.json({ ok: false, message: 'Missing session token' }, 401);
  }

  let sessionData: SessionData;
  try {
    sessionData = await unsealSessionData<SessionData>(sessionToken);
  } catch {
    console.log('Invalid session token');
    return c.json({ ok: false, message: 'Invalid session token' }, 401);
  }

  const storedCookie = sessionData.cookie;
  if (!storedCookie) {
    console.log('No credentials found in session');
    return c.json({ ok: false, message: 'No credentials found in session' }, 401);
  }

  const baseURL = sessionData.baseURL;
  const districtURL = baseURL.split('/')[0];

  const appNameMatch = storedCookie.match(/appName=([^;]+)/);
  if (!appNameMatch) {
    return c.json({ ok: false, message: 'Missing appName in session cookie' }, 401);
  }
  const appName = appNameMatch[1];

  const cookieForBootstrap = `appType=student;campus_hybrid_app=student;deviceID=${sessionData.deviceId};${storedCookie};`;

  let bootstrapRes = await fetch(`https://${baseURL}/mobile/hybridAppUtil.jsp`, {
    method: 'POST',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieForBootstrap,
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    },
    body: new URLSearchParams({
      appName: appName,
      deviceID: sessionData.deviceId,
      deviceModel: sessionData.deviceModel,
      deviceType: sessionData.deviceType,
      systemVersion: sessionData.systemVersion,
      appType: 'student',
      appVersion: '1.11.4',
      bootstrapped: '1',
      registrationToken: 'null',
    }).toString(),
    redirect: 'manual',
  });

  const setCookie = getSetCookieHeaders(bootstrapRes.headers);
  const bootstrapCookie = mergeCookies(cookieForBootstrap, setCookie);
  const xsrfMatch = bootstrapCookie.match(/XSRF-TOKEN=([^;]+)/);
  const xsrfToken = xsrfMatch ? xsrfMatch[1] : '';
  const updateResponse = await fetch(`https://${baseURL}/api/campus/hybridDevice/update`, {
    method: 'POST',
    headers: {
      Host: districtURL,
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: `https://${districtURL}`,
      Connection: 'keep-alive',
      Cookie: bootstrapCookie,
      'x-xsrf-token': xsrfToken,
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    },
    body: JSON.stringify({
      registrationToken: 'marks',
      deviceType: sessionData.deviceType,
      deviceModel: 'marks/' + sessionData.deviceModel,
      appVersion: '1.11.4',
      systemVersion: sessionData.systemVersion,
      deviceID: sessionData.deviceId,
      keepMeLoggedIn: true,
    }),
  });

  if (updateResponse.status !== 200) {
    console.log('Device update failed', updateResponse.status);
    return c.json(
      { ok: false, message: 'Failed to refresh device registration' },
      updateResponse.status as ContentfulStatusCode
    );
  }
  const updatedCookie = mergeCookies(bootstrapCookie, getSetCookieHeaders(updateResponse.headers));

  const { ids, accountStatus } = await fetchUserIDs(
    baseURL,
    updatedCookie,
    'marks/1.0 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  );
  if (accountStatus !== 200) {
    console.log('Session verification failed', accountStatus);
  }
  // Keep the IDs captured at login when IC cannot report them.
  const userID = ids.userID ?? sessionData.userID;
  const personID = ids.personID ?? sessionData.personID;

  if (personID == null || userID == null) {
    console.log('No personID or userID found in user data');
    return c.json({ ok: false, message: 'Failed to get user information' }, 502);
  }

  const newSessionToken = await sealSessionData({
    cookie: updatedCookie,
    baseURL: sessionData.baseURL,
    deviceId: sessionData.deviceId,
    deviceModel: sessionData.deviceModel,
    deviceType: sessionData.deviceType,
    systemVersion: sessionData.systemVersion,
    userID: userID,
    personID: personID,
  });

  const uuid = await createICSession(userID, personID, newSessionToken);

  if (fromCookie) setWebSessionCookie(c, newSessionToken);

  return c.json({
    ok: true,
    uuid: uuid,
    sessionToken: newSessionToken,
  });
});

auth.post('/updateDevice', async (c) => {
  //initial login step
  const res = await c.req.json();
  const schema = z.object({
    cookieHeader: z.string(),
    deviceType: z.string(),
    deviceModel: z.string(),
    systemVersion: z.string(),
    deviceID: z.string(),
    districtURL: z.string(),
  });

  const { cookieHeader, deviceType, deviceModel, systemVersion, deviceID, districtURL } =
    schema.parse(res);
  const baseURL = `${districtURL}/campus`;

  const { ids, accountStatus } = await fetchUserIDs(
    baseURL,
    cookieHeader,
    'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  );
  const personID = ids.personID;
  if (!personID) {
    console.log('Cookie verification failed', accountStatus);
    return c.json(
      { ok: false, message: 'Failed to verify login' },
      (accountStatus === 200 ? 401 : accountStatus) as ContentfulStatusCode
    );
  }
  if (accountStatus !== 200) {
    console.log('Cookie verification fell back to grade data', accountStatus);
  }
  // userID only keys the stored session; reuse the student's previous one if IC
  // could not report it.
  const userID = ids.userID ?? (await findStoredUserID(personID, baseURL)) ?? 0;

  const xsrfMatch = cookieHeader.match(/XSRF-TOKEN=([^;]+)/);
  const xsrfToken = xsrfMatch ? xsrfMatch[1] : '';

  const response = await fetch(`https://${baseURL}/api/campus/hybridDevice/update`, {
    method: 'POST',
    headers: {
      Host: districtURL,
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: `https://${districtURL}`,
      Connection: 'keep-alive',
      Cookie: `appType=student;campus_hybrid_app=student;deviceID=${deviceID};${cookieHeader};`,
      'x-xsrf-token': xsrfToken,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent':
        'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    },
    body: JSON.stringify({
      registrationToken: 'marks',
      deviceType: deviceType,
      deviceModel: 'marks/' + deviceModel,
      appVersion: '1.11.4',
      systemVersion: systemVersion,
      deviceID: deviceID,
      keepMeLoggedIn: true,
    }),
  });
  const data = await response.json();
  if (response.status !== 200) {
    return c.json(
      { ok: false, message: response.statusText },
      response.status as ContentfulStatusCode
    );
  }

  const fullCookie = mergeCookies(cookieHeader, getSetCookieHeaders(response.headers));

  const sessionToken = await sealSessionData({
    cookie: fullCookie,
    baseURL: `${districtURL}/campus`,
    deviceId: deviceID,
    deviceModel,
    deviceType,
    systemVersion,
    userID: userID,
    personID: personID,
  });

  const uuid = await createICSession(userID, personID, sessionToken);

  if (!uuid) {
    return c.json({ ok: false, message: 'Failed to create session record' }, 500);
  }

  return c.json({
    ok: true,
    data: data,
    uuid: uuid,
    sessionToken,
  });
});

export default auth;
