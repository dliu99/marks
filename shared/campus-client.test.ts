// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { createCampusClient } from './campus-client';
import { createLocalAPI } from '../api/src/shared/local-api';
import { QueryClient } from '@tanstack/react-query';
import gradeFixture from '../api/fixtures/grade-report-quarter-terms.json';

const initialSession = () => ({
  baseURL: 'district.example/campus',
  cookie: 'appName=school; session=old; XSRF-TOKEN=old',
  deviceId: 'phone',
  deviceModel: 'iPhone',
  deviceType: 'iOS',
  systemVersion: '26',
  userID: 12,
  personID: 34,
});

function fixture(handler) {
  let current = initialSession();
  let generation = 0;
  const statuses = [];
  const repository = {
    get: () => current,
    save: (value) => {
      current = value;
    },
    generation: () => generation,
  };
  const client = createCampusClient(
    repository,
    (input, init) => handler(new URL(String(input)), new Headers(init.headers), init),
    (status) => statuses.push(status)
  );
  return {
    ...client,
    repository,
    statuses,
    signOut() {
      current = null;
      generation++;
    },
    signIn() {
      current = initialSession();
      generation++;
    },
  };
}

function bootstrapResponse() {
  return new Response(null, {
    status: 302,
    headers: { 'set-cookie': 'session=renewed; Path=/, XSRF-TOKEN=new%2Btoken; Path=/' },
  });
}

function renewalResponse(url, headers) {
  if (url.pathname.endsWith('hybridAppUtil.jsp')) {
    expect(headers.get('cookie')).toContain('appType=student');
    expect(headers.get('cookie')).toContain('campus_hybrid_app=student');
    expect(headers.get('cookie')).toContain('deviceID=phone');
    return bootstrapResponse();
  }
  expect(headers.get('cookie')).toContain('session=renewed');
  expect(headers.get('x-xsrf-token')).toBe('new+token');
  if (url.pathname.endsWith('hybridDevice/update')) return Response.json({});
  if (url.pathname.endsWith('userAccount')) return Response.json({ userID: 12, personID: 34 });
  throw new Error(`Unexpected renewal path: ${url.pathname}`);
}

describe('automatic school session renewal', () => {
  for (const failure of ['401', 'redirect', 'HTML login']) {
    test(`renews and retries a class detail request after ${failure}`, async () => {
      let bootstraps = 0;
      let detailCalls = 0;
      const f = fixture(async (url, headers) => {
        if (url.pathname.includes('/grades/detail/')) {
          detailCalls++;
          if (headers.get('cookie').includes('session=old')) {
            if (failure === 'redirect')
              return new Response(null, { status: 302, headers: { location: '/login' } });
            if (failure === 'HTML login')
              return new Response('<html>Login</html>', {
                headers: { 'content-type': 'text/html' },
              });
            return new Response(null, { status: 401 });
          }
          return Response.json(gradeFixture.details['4001']);
        }
        if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
        return renewalResponse(url, headers);
      });
      const app = createLocalAPI(f.repository, f.request);
      const res = await app.request('https://marks.local/ic/courseGrades/4001?termID=301');
      expect(res.status).toBe(200);
      expect((await res.json()).task.sectionID).toBe(4001);
      expect(detailCalls).toBe(2);
      expect(bootstraps).toBe(1);
      expect(f.statuses).toEqual(['authenticated']);
      expect(f.repository.get().cookie).toContain('session=renewed');
    });
  }

  test('concurrent expired requests share one renewal', async () => {
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.includes('/grades/detail/')) {
        if (headers.get('cookie').includes('session=old'))
          return new Response(null, { status: 401 });
        return Response.json({ section: url.pathname.split('/').pop() });
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return renewalResponse(url, headers);
    });
    const responses = await Promise.all(
      [1, 2, 3].map((id) =>
        f.request(`https://district.example/campus/resources/portal/grades/detail/${id}`)
      )
    );
    expect(responses.every((res) => res.ok)).toBe(true);
    expect(bootstraps).toBe(1);
    expect(f.statuses).toEqual(['authenticated']);
  });

  test('a cached class recovers from an outage and expiration without signing out', async () => {
    let offline = true;
    const f = fixture(async (url, headers) => {
      if (offline) throw new Error('Offline');
      if (url.pathname.includes('/grades/detail/')) {
        return headers.get('cookie').includes('session=old')
          ? new Response(null, { status: 401 })
          : Response.json(gradeFixture.details['4001']);
      }
      return renewalResponse(url, headers);
    });
    const app = createLocalAPI(f.repository, f.request);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ['ic', 'courseGrade', 4001, 301, null];
    const saved = { task: { sectionID: 4001 }, categories: [] };
    client.setQueryData(queryKey, saved, { updatedAt: 1 });
    const options = {
      queryKey,
      queryFn: async () => {
        const response = await app.request('https://marks.local/ic/courseGrades/4001?termID=301');
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json();
      },
    };
    await expect(client.fetchQuery(options)).rejects.toThrow('503');
    expect(client.getQueryData(queryKey)).toEqual(saved);
    expect(client.getQueryState(queryKey).error).not.toBeNull();
    offline = false;
    const detail = await client.fetchQuery(options);
    expect(detail.task.sectionID).toBe(4001);
    expect(detail.categories.length).toBeGreaterThan(0);
    expect(client.getQueryState(queryKey).error).toBeNull();
    expect(client.getQueryState(queryKey).dataUpdatedAt).toBeGreaterThan(1);
    expect(f.statuses).toEqual(['authenticated']);
    client.clear();
  });

  test('an unauthorized mutation is retried with its body and the renewed XSRF token', async () => {
    let attempts = 0;
    const body = JSON.stringify({ calendarID: 1, responsiveOfferingID: 2 });
    const f = fixture(async (url, headers, init) => {
      if (url.pathname.endsWith('responsiveSchedule/update')) {
        attempts++;
        expect(init.method).toBe('POST');
        expect(init.body).toBe(body);
        if (headers.get('cookie').includes('session=old'))
          return new Response(null, { status: 401 });
        expect(headers.get('x-xsrf-token')).toBe('new+token');
        return Response.json({ success: true });
      }
      return renewalResponse(url, headers);
    });
    const response = await f.request(
      'https://district.example/campus/resources/prism/portal/responsiveSchedule/update',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );
    expect(await response.json()).toEqual({ success: true });
    expect(attempts).toBe(2);
  });

  test('late expired responses cannot delete fresh credentials or start another renewal', async () => {
    let releaseLateResponse;
    const lateResponse = new Promise((resolve) => {
      releaseLateResponse = resolve;
    });
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.includes('/grades/detail/')) {
        if (headers.get('cookie').includes('session=old')) {
          if (url.pathname.endsWith('/2')) await lateResponse;
          return new Response(null, {
            status: 401,
            headers: { 'set-cookie': 'session=; Max-Age=0' },
          });
        }
        return Response.json({ ok: true });
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return renewalResponse(url, headers);
    });
    const first = f.request('https://district.example/campus/resources/portal/grades/detail/1');
    const second = f.request('https://district.example/campus/resources/portal/grades/detail/2');
    expect((await first).ok).toBe(true);
    releaseLateResponse();
    expect((await second).ok).toBe(true);
    expect(bootstraps).toBe(1);
    expect(f.repository.get().cookie).toContain('session=renewed');
  });

  test('startup renewal holds new school requests until fresh cookies are ready', async () => {
    let releaseBootstrap;
    const bootstrapGate = new Promise((resolve) => {
      releaseBootstrap = resolve;
    });
    let schoolCalls = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('hybridAppUtil.jsp')) {
        await bootstrapGate;
        return bootstrapResponse();
      }
      if (url.pathname.endsWith('/grades')) {
        schoolCalls++;
        expect(headers.get('cookie')).toContain('session=renewed');
        return Response.json([]);
      }
      return renewalResponse(url, headers);
    });
    const renewal = f.renew();
    const request = f.request('https://district.example/campus/resources/portal/grades');
    expect(schoolCalls).toBe(0);
    releaseBootstrap();
    await renewal;
    expect((await request).ok).toBe(true);
    expect(schoolCalls).toBe(1);
  });

  test('a failed startup renewal does not fail requests whose session still works', async () => {
    let bootstraps = 0;
    const f = fixture(async (url) => {
      if (url.pathname.endsWith('hybridAppUtil.jsp')) {
        bootstraps++;
        return new Response(null, { status: 500 });
      }
      if (url.pathname.endsWith('/grades')) return Response.json([]);
      throw new Error(`Unexpected path: ${url.pathname}`);
    });
    const renewal = f.renew();
    const request = f.request('https://district.example/campus/resources/portal/grades');
    await expect(renewal).rejects.toMatchObject({ status: 500 });
    expect((await request).ok).toBe(true);
    expect(bootstraps).toBe(1);
    expect(f.statuses).toEqual([]);
  });

  test('requests waiting on a failed startup renewal renew once more if their session expired', async () => {
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('/grades')) {
        return headers.get('cookie').includes('session=old')
          ? new Response(null, { status: 401 })
          : Response.json([]);
      }
      // The startup renewal hits a brief outage; the next one succeeds.
      if (url.pathname.endsWith('hybridAppUtil.jsp') && ++bootstraps === 1) {
        throw new Error('Offline');
      }
      return renewalResponse(url, headers);
    });
    const renewal = f.renew();
    const first = f.request('https://district.example/campus/resources/portal/grades');
    const second = f.request('https://district.example/campus/resources/portal/grades');
    await expect(renewal).rejects.toMatchObject({ status: 0 });
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(bootstraps).toBe(2);
    expect(f.statuses).toEqual(['authenticated']);
  });

  test('can renew again when the session expires later in the same app run', async () => {
    let expired = true;
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('/grades')) {
        return expired ? new Response(null, { status: 401 }) : Response.json([]);
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) {
        bootstraps++;
        expired = false;
      }
      return renewalResponse(url, headers);
    });
    expect((await f.request('https://district.example/campus/resources/portal/grades')).ok).toBe(
      true
    );
    expired = true;
    expect((await f.request('https://district.example/campus/resources/portal/grades')).ok).toBe(
      true
    );
    expect(bootstraps).toBe(2);
  });

  test('a failed renewal terminates without recursion and marks the session expired', async () => {
    let bootstraps = 0;
    const f = fixture(async (url) => {
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return new Response(null, { status: 401 });
    });
    await expect(
      f.request('https://district.example/campus/resources/portal/grades')
    ).rejects.toMatchObject({ status: 401 });
    expect(bootstraps).toBe(1);
    expect(f.statuses).toEqual(['expired']);
    expect(f.repository.get()).not.toBeNull();
  });

  test('a class still unauthorized after renewal is only retried once', async () => {
    let detailCalls = 0;
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.includes('/grades/detail/')) {
        detailCalls++;
        return new Response(null, { status: 401 });
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return renewalResponse(url, headers);
    });
    await expect(
      f.request('https://district.example/campus/resources/portal/grades/detail/1')
    ).rejects.toMatchObject({ status: 401 });
    expect(detailCalls).toBe(2);
    expect(bootstraps).toBe(1);
    expect(f.statuses).toEqual(['authenticated', 'expired']);
  });

  test('a temporary renewal outage keeps the account and can recover on the next refresh', async () => {
    let offline = true;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('/grades')) {
        return headers.get('cookie').includes('session=old')
          ? new Response(null, { status: 401 })
          : Response.json([]);
      }
      if (offline) throw new Error('Offline');
      return renewalResponse(url, headers);
    });
    await expect(
      f.request('https://district.example/campus/resources/portal/grades')
    ).rejects.toMatchObject({ status: 0 });
    expect(f.repository.get()).not.toBeNull();
    expect(f.statuses).toEqual([]);
    offline = false;
    expect((await f.request('https://district.example/campus/resources/portal/grades')).ok).toBe(
      true
    );
  });

  const listView = 'https://district.example/campus/api/portal/assignment/listView';

  test("IC's 403 for an expired session on /api/ renews and retries", async () => {
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('/listView')) {
        return headers.get('cookie').includes('session=old')
          ? new Response(null, { status: 403 })
          : Response.json([]);
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return renewalResponse(url, headers);
    });
    expect((await f.request(listView)).ok).toBe(true);
    expect(bootstraps).toBe(1);
    expect(f.statuses).toEqual(['authenticated']);
  });

  test('concurrent expired 403s share one renewal', async () => {
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('/listView') || url.pathname.endsWith('/my')) {
        return headers.get('cookie').includes('session=old')
          ? new Response(null, { status: 403 })
          : Response.json([]);
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return renewalResponse(url, headers);
    });
    const results = await Promise.all([
      f.request(listView),
      f.request('https://district.example/campus/api/campus/userAccounts/my'),
    ]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(bootstraps).toBe(1);
  });

  test('a real permission error renews at most once and never signs out', async () => {
    let calls = 0;
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('/listView')) {
        calls++;
        return new Response(null, { status: 403 });
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return renewalResponse(url, headers);
    });
    expect((await f.request(listView)).status).toBe(403);
    expect((await f.request(listView)).status).toBe(403);
    expect(calls).toBe(3);
    expect(bootstraps).toBe(1);
    expect(f.statuses).toEqual(['authenticated']);
  });

  test('a 403 right after a renewal is a permission error, not an expired session', async () => {
    let calls = 0;
    let bootstraps = 0;
    const f = fixture(async (url, headers) => {
      if (url.pathname.endsWith('/listView')) {
        calls++;
        return new Response(null, { status: 403 });
      }
      if (url.pathname.endsWith('hybridAppUtil.jsp')) bootstraps++;
      return renewalResponse(url, headers);
    });
    await f.renew();
    expect((await f.request(listView)).status).toBe(403);
    expect(calls).toBe(1);
    expect(bootstraps).toBe(1);
  });

  test('a revoked saved login asks the user to sign in again', async () => {
    const f = fixture(async (url) => {
      if (url.pathname.endsWith('hybridAppUtil.jsp')) {
        return new Response(null, {
          status: 302,
          headers: {
            location: 'https://district.example/campus/mobile/persistentCookieRevoked.html',
          },
        });
      }
      if (url.pathname.endsWith('/grades')) return new Response(null, { status: 401 });
      throw new Error(`Unexpected path: ${url.pathname}`);
    });
    await expect(
      f.request('https://district.example/campus/resources/portal/grades')
    ).rejects.toMatchObject({ status: 401 });
    expect(f.statuses).toEqual(['expired']);
    expect(f.repository.get()).not.toBeNull();
  });

  test('device registration refused with 403 during renewal asks the user to sign in again', async () => {
    const f = fixture(async (url) => {
      if (url.pathname.endsWith('hybridAppUtil.jsp')) return bootstrapResponse();
      if (url.pathname.endsWith('hybridDevice/update')) return new Response(null, { status: 403 });
      return new Response(null, { status: 401 });
    });
    await expect(f.renew()).rejects.toMatchObject({ status: 401 });
    expect(f.statuses).toEqual(['expired']);
  });

  test('signing out during renewal cannot restore cookies or update authentication', async () => {
    const f = fixture(async (url) => {
      if (url.pathname.endsWith('hybridAppUtil.jsp')) {
        f.signOut();
        return bootstrapResponse();
      }
      return new Response(null, { status: 401 });
    });
    await expect(
      f.request('https://district.example/campus/resources/portal/grades')
    ).rejects.toMatchObject({ status: 409 });
    expect(f.repository.get()).toBeNull();
    expect(f.statuses).toEqual([]);
  });

  test('re-login to the same account during renewal cannot be overwritten by the old request', async () => {
    const f = fixture(async (url) => {
      if (url.pathname.endsWith('hybridAppUtil.jsp')) {
        f.signIn();
        return bootstrapResponse();
      }
      return new Response(null, { status: 401 });
    });
    await expect(
      f.request('https://district.example/campus/resources/portal/grades')
    ).rejects.toMatchObject({ status: 409 });
    expect(f.repository.get().cookie).toContain('session=old');
    expect(f.statuses).toEqual([]);
  });
});
