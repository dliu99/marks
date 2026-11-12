import { fetchWithTimeout } from './fetch-timeout';
import { z } from 'zod';

export const campusSessionSchema = z.object({
  baseURL: z.string().refine((value) => {
    try {
      const url = new URL(`https://${value}`);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        url.pathname === '/campus' &&
        !url.search &&
        !url.hash &&
        url.hostname.includes('.') &&
        value === `${url.hostname}/campus`
      );
    } catch {
      return false;
    }
  }, 'Invalid district address'),
  cookie: z.string().min(1),
  deviceId: z.string().min(1),
  deviceModel: z.string(),
  deviceType: z.string(),
  systemVersion: z.string(),
  userID: z.number().int().positive(),
  personID: z.number().int().positive(),
});
export type CampusSession = z.infer<typeof campusSessionSchema>;

export class CampusError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export function mergeCookies(cookie: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) jar.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  // A combined Set-Cookie header may contain commas inside Expires attributes.
  for (const header of setCookies.flatMap((value) => value.split(/,(?=\s*[^;,=\s]+\s*=)/))) {
    const [pair, ...attributes] = header.split(';');
    const index = pair.indexOf('=');
    if (index < 1) continue;
    const name = pair.slice(0, index).trim();
    const expired = attributes.some((attr) => {
      const [key, ...values] = attr.trim().split('=');
      const value = values.join('=');
      return (
        (key.toLowerCase() === 'max-age' && Number(value) <= 0) ||
        (key.toLowerCase() === 'expires' && Date.parse(value) <= Date.now())
      );
    });
    if (expired) jar.delete(name);
    else jar.set(name, pair.slice(index + 1).trim());
  }
  return [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
}

export function getSetCookies(headers: Headers): string[] {
  const candidate = headers as Headers & { getSetCookie?: () => string[] };
  return (
    candidate.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
  );
}

export interface SessionRepository {
  get(): CampusSession | null;
  save(session: CampusSession): void;
  generation?: () => number;
}

export function createCampusTransport(repository: SessionRepository, network: typeof fetch) {
  return async function request(
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    const generation = repository.generation?.();
    const session = repository.get();
    if (!session) throw new CampusError('Sign in to your school to continue.', 401);
    const url = new URL(String(input));
    if (
      url.origin !== new URL(`https://${session.baseURL}`).origin ||
      !url.pathname.startsWith('/campus/')
    ) {
      throw new CampusError('Invalid school request.', 400);
    }
    const headers = new Headers(init.headers);
    headers.delete('Host');
    headers.delete('Connection');
    headers.set(
      'Cookie',
      mergeCookies(session.cookie, [
        'appType=student',
        'campus_hybrid_app=student',
        `deviceID=${session.deviceId}`,
      ])
    );
    if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/plain, */*');
    if (!headers.has('User-Agent')) {
      const agent =
        session.deviceType === 'Android'
          ? `Mozilla/5.0 (Linux; Android ${session.systemVersion}; ${session.deviceModel}) AppleWebKit/537.36 Mobile Safari/537.36`
          : `Mozilla/5.0 (iPhone; CPU iPhone OS ${session.systemVersion.replace(/\./g, '_')} like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148`;
      headers.set('User-Agent', `StudentApp/1.11.4 ${agent}`);
    }
    if (init.method && init.method !== 'GET') headers.set('Origin', url.origin);
    const xsrf = session.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1];
    if (xsrf) {
      try {
        headers.set('x-xsrf-token', decodeURIComponent(xsrf));
      } catch {
        headers.set('x-xsrf-token', xsrf);
      }
    }
    let response: Response;
    try {
      const options = {
        ...init,
        headers,
        credentials: 'omit' as const,
        redirect: 'manual' as const,
      };
      response = await fetchWithTimeout(network, url.toString(), options);
    } catch {
      throw new CampusError('Unable to reach your school.', 0);
    }
    // A response belonging to a signed-out/replaced account must never restore its session.
    const current = repository.get();
    if (
      repository.generation?.() !== generation ||
      !current ||
      current.deviceId !== session.deviceId ||
      current.baseURL !== session.baseURL ||
      current.userID !== session.userID ||
      current.personID !== session.personID
    ) {
      throw new CampusError('Your account changed. Please try again.', 409);
    }
    const cookie = mergeCookies(current.cookie, getSetCookies(response.headers));
    if (cookie !== current.cookie) repository.save({ ...current, cookie });
    if (
      response.status >= 300 &&
      response.status < 400 &&
      url.pathname !== '/campus/mobile/hybridAppUtil.jsp'
    ) {
      throw new CampusError('Your school session needs to be renewed.', 401);
    }
    if (response.status === 401) throw new CampusError('Please sign in to your school again.', 401);
    if (
      response.headers.get('content-type')?.includes('text/html') &&
      (url.pathname.includes('/resources/') || url.pathname.includes('/api/'))
    ) {
      throw new CampusError('Please sign in to your school again.', 401);
    }
    return response;
  };
}
