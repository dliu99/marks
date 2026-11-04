// @ts-nocheck -- Bun tests are also included by the Worker-only tsconfig.
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import * as Iron from 'iron-webcrypto';

const ironKey = 'test-key-'.repeat(8);
mock.module('cloudflare:workers', () => ({ env: { IRON_KEY: ironKey } }));
const { default: ic } = await import('./ic');
const cookie = 'JSESSIONID=test; XSRF-TOKEN=csrf-test; portalApp=student';
const token = await Iron.seal(
  { cookie, baseURL: 'district.example/campus', personID: 123 },
  ironKey,
  Iron.defaults
);
let fetchSpy;
afterEach(() => fetchSpy?.mockRestore());

function register() {
  return ic.request(
    '/responsiveSchedule/update?calendarID=10&responsiveOfferingID=20&responsiveSessionID=30',
    { method: 'POST', headers: { Authorization: token } }
  );
}

test('registration forwards the CSRF pair and browser origin headers', async () => {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    expect(String(url)).toBe(
      'https://district.example/campus/resources/prism/portal/responsiveSchedule/update'
    );
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBe(cookie);
    expect(headers.get('x-xsrf-token')).toBe('csrf-test');
    expect(headers.get('origin')).toBe('https://district.example');
    expect(headers.get('referer')).toBe(
      'https://district.example/campus/apps/portal/student/responsive-schedule'
    );
    expect(JSON.parse(init.body)).toEqual({
      personID: 123,
      calendarID: 10,
      responsiveOfferingID: 20,
      responsiveSessionID: 30,
    });
    return Response.json({ success: true, message: 'Saved' });
  });
  const response = await register();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, message: 'Saved' });
});
