// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import {
  campusSessionSchema,
  createCampusTransport,
  mergeCookies,
} from '../api/src/shared/campus-session';
import { renewCampusSession } from './campus-auth';
import { createLocalAPI } from '../api/src/shared/local-api';
import { parseSchoolLogin } from './districts';

const session = () => ({
  baseURL: 'district.example/campus',
  cookie: 'appName=school;session=old;XSRF-TOKEN=a%2Bb',
  deviceId: 'phone',
  deviceModel: 'iPhone',
  deviceType: 'iOS',
  systemVersion: '26',
  userID: 12,
  personID: 34,
});
function fixture(network) {
  let current = session();
  let generation = 0;
  const repository = {
    get: () => current,
    save: (value) => {
      current = value;
    },
    generation: () => generation,
  };
  return {
    repository,
    transport: createCampusTransport(repository, network),
    signOut: () => {
      current = null;
      generation++;
    },
    signIn: () => {
      current = session();
      generation++;
    },
  };
}
const json = (value, init = {}) => Response.json(value, init);

describe('session validation and cookies', () => {
  test('accepts a district session and rejects an embedded URL, credentials, path or query', () => {
    expect(campusSessionSchema.safeParse(session()).success).toBe(true);
    for (const baseURL of [
      'https://district.example/campus',
      'user:pass@district.example/campus',
      'district.example:80/campus',
      'district.example/campus/../other',
      'district.example/campus?secret=x',
    ]) {
      expect(campusSessionSchema.safeParse({ ...session(), baseURL }).success).toBe(false);
    }
  });
  test('preserves equals signs and unrelated cookies during rotation', () => {
    expect(mergeCookies('session=old;appName=school', ['session=new==; Path=/; HttpOnly'])).toBe(
      'session=new==; appName=school'
    );
  });
  test('splits combined Set-Cookie without splitting Expires dates', () => {
    expect(
      mergeCookies('a=old; keep=yes', [
        'a=new; Expires=Wed, 21 Oct 2099 07:28:00 GMT, b=two; Path=/',
      ])
    ).toBe('a=new; keep=yes; b=two');
  });
  test('removes expired cookies', () => {
    expect(
      mergeCookies('a=x;b=y;c=z', ['a=; Max-Age=0', 'b=; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])
    ).toBe('c=z');
  });
});

describe('direct school networking', () => {
  test('sends cookies and decoded XSRF only to the school and persists rotation', async () => {
    const f = fixture(async (url, init) => {
      expect(new URL(url).hostname).toBe('district.example');
      expect(init.credentials).toBe('omit');
      expect(init.redirect).toBe('manual');
      expect(init.headers.get('cookie')).toContain('session=old');
      expect(init.headers.get('x-xsrf-token')).toBe('a+b');
      return json([], { headers: { 'set-cookie': 'session=new; HttpOnly' } });
    });
    await f.transport('https://district.example/campus/resources/portal/grades');
    expect(f.repository.get().cookie).toContain('session=new');
  });
  test('refuses external hosts, HTTP and non-campus paths before making any request', async () => {
    let calls = 0;
    const f = fixture(async () => {
      calls++;
      return json({});
    });
    for (const url of [
      'https://other.example/campus/resources/x',
      'http://district.example/campus/resources/x',
      'https://district.example/other',
    ]) {
      await expect(f.transport(url)).rejects.toMatchObject({ status: 400 });
    }
    expect(calls).toBe(0);
  });
  test('offline errors preserve the session', async () => {
    const f = fixture(async () => {
      throw new Error('Offline');
    });
    await expect(
      f.transport('https://district.example/campus/resources/my/userAccount')
    ).rejects.toMatchObject({ status: 0 });
    expect(f.repository.get()).not.toBeNull();
  });
  test('redirects and HTML login responses request renewal without following redirects', async () => {
    for (const response of [
      new Response('', { status: 302, headers: { location: 'https://other.example' } }),
      new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }),
    ]) {
      const f = fixture(async () => response);
      await expect(
        f.transport('https://district.example/campus/resources/my/userAccount')
      ).rejects.toMatchObject({ status: 401 });
      expect(f.repository.get()).not.toBeNull();
    }
  });
  test('403 does not destroy the session', async () => {
    const f = fixture(async () => new Response('', { status: 403 }));
    expect((await f.transport('https://district.example/campus/api/test')).status).toBe(403);
    expect(f.repository.get()).not.toBeNull();
  });
  test('a response arriving after sign-out cannot restore credentials', async () => {
    const f = fixture(async () => {
      f.signOut();
      return json({}, { headers: { 'set-cookie': 'session=late' } });
    });
    await expect(f.transport('https://district.example/campus/api/test')).rejects.toMatchObject({
      status: 409,
    });
    expect(f.repository.get()).toBeNull();
  });
  test('a late response from the same account after re-login cannot overwrite the new session', async () => {
    const f = fixture(async () => {
      f.signIn();
      return json({}, { headers: { 'set-cookie': 'session=late' } });
    });
    await expect(f.transport('https://district.example/campus/api/test')).rejects.toMatchObject({
      status: 409,
    });
    expect(f.repository.get().cookie).toContain('session=old');
  });
  test('renews using bootstrap, device update and account verification with rotating cookies', async () => {
    const calls = [];
    const f = fixture(async (url, init) => {
      const path = new URL(url).pathname;
      calls.push(path);
      if (path.endsWith('hybridAppUtil.jsp')) {
        expect(init.body).toContain('appName=school');
        return new Response(null, {
          status: 302,
          headers: { 'set-cookie': 'session=bootstrapped' },
        });
      }
      expect(init.headers.get('cookie')).toContain('session=bootstrapped');
      if (path.endsWith('update')) {
        expect(JSON.parse(init.body).deviceID).toBe('phone');
        return json({});
      }
      return json({ userID: 12, personID: 34 });
    });
    await renewCampusSession(f.repository.get(), f.transport);
    expect(calls).toEqual([
      '/campus/mobile/hybridAppUtil.jsp',
      '/campus/api/campus/hybridDevice/update',
      '/campus/resources/my/userAccount',
    ]);
  });
  test('rejects renewed sessions for a different school account', async () => {
    const f = fixture(async (url) =>
      new URL(url).pathname.endsWith('userAccount')
        ? json({ userID: 999, personID: 888 })
        : json({})
    );
    await expect(renewCampusSession(f.repository.get(), f.transport)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('local routing with Marks services unavailable', () => {
  test('fetches all school features directly and keeps current response shapes', async () => {
    const visited = [];
    const f = fixture(async (url, init) => {
      const target = new URL(url);
      expect(target.origin).toBe('https://district.example');
      visited.push(target.pathname);
      if (target.pathname.endsWith('userAccount'))
        return json({ userID: 12, personID: 34, firstName: 'Student' });
      if (target.pathname.endsWith('/gpa'))
        return json([{ type: 'Cumulative', unweighted: true, gpa: '3.8000' }]);
      if (target.pathname.includes('/attendance/'))
        return json({ terms: [{ courses: [{ absentList: [1, 2], tardyList: [1] }] }] });
      if (target.pathname.endsWith('responsiveSchedule/update')) {
        expect(init.headers.get('x-xsrf-token')).toBe('a+b');
        expect(JSON.parse(init.body).personID).toBe(34);
        return json({ success: true, message: 'Updated' });
      }
      if (target.pathname.includes('/section/content/'))
        return json({ objectID: 7, curriculumContent: 'Test' });
      return json([]);
    });
    const app = createLocalAPI(f.repository, f.transport);
    const get = async (path) => {
      const res = await app.request(`https://marks.local/ic/${path}`);
      expect(res.status).toBe(200);
      return res.json();
    };
    expect((await get('user')).firstName).toBe('Student');
    expect((await get('user/profile')).gpa.uw).toBe('3.8');
    expect(await get('attendance/1')).toEqual({ absences: 2, tardies: 1 });
    expect(await get('courseGrades')).toEqual([]);
    expect(await get('courseGrades/terms')).toEqual([]);
    expect(await get('assignments')).toEqual([]);
    expect((await get('assignments/7')).objectID).toBe(7);
    expect(await get('user/appList')).toEqual([]);
    expect(await get('responsiveSchedule?sectionID=1&calendarID=2&structureID=3')).toEqual([]);
    const update = await app.request(
      'https://marks.local/ic/responsiveSchedule/update?calendarID=2&responsiveOfferingID=3&responsiveSessionID=4',
      { method: 'POST' }
    );
    expect(await update.json()).toEqual({ ok: true, message: 'Updated' });
    expect(visited.length).toBe(10);
  });
  test('returns 401 for an absent session and 503 for a school outage', async () => {
    const f = fixture(async () => {
      throw new Error('Offline');
    });
    const app = createLocalAPI(f.repository, f.transport);
    expect((await app.request('https://marks.local/ic/courseGrades')).status).toBe(503);
    f.signOut();
    expect((await app.request('https://marks.local/ic/courseGrades')).status).toBe(401);
  });
});

test('manual school login works without district discovery', () => {
  expect(parseSchoolLogin('https://district.example/campus/portal/school.jsp')).toEqual({
    uri: 'https://district.example/campus/portal/students/school.jsp',
    districtAppName: 'school',
  });
  for (const url of [
    'http://district.example/campus/portal/school.jsp',
    'https://user:pass@district.example/campus/school.jsp',
    'https://district.example/not-campus/login.jsp',
    'https://district.example/campus/home',
  ]) {
    expect(() => parseSchoolLogin(url)).toThrow();
  }
});
